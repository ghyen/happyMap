#!/usr/bin/env python3
"""
2025년 2차 청년 매입임대주택 PDF 파싱 스크립트
2~3순위 청년 기준 보증금/임대료 추출
"""

import pdfplumber
import json
import re
import requests
import time
import os
from dotenv import load_dotenv

load_dotenv('.env.local')

KAKAO_API_KEY = os.environ["KAKAO_MAP_API_KEY"]

def geocode_address(address):
    """카카오 API를 사용하여 주소를 좌표로 변환"""
    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_API_KEY}"}
    params = {"query": address}

    try:
        response = requests.get(url, headers=headers, params=params)
        result = response.json()

        if result.get("documents"):
            doc = result["documents"][0]
            return float(doc["y"]), float(doc["x"])

        # 주소 검색 실패 시 키워드 검색 시도
        url2 = "https://dapi.kakao.com/v2/local/search/keyword.json"
        response2 = requests.get(url2, headers=headers, params=params)
        result2 = response2.json()

        if result2.get("documents"):
            doc = result2["documents"][0]
            return float(doc["y"]), float(doc["x"])

    except Exception as e:
        print(f"Geocoding error for {address}: {e}")

    return None, None

def parse_pdf(pdf_path):
    """PDF에서 주택 데이터 추출"""
    properties = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            tables = page.extract_tables()

            for table in tables:
                for row in table:
                    if not row or len(row) < 15:
                        continue

                    # 첫 번째 컬럼이 숫자인지 확인 (연번)
                    try:
                        idx = int(row[0])
                    except (ValueError, TypeError):
                        continue

                    # 데이터 추출
                    prop = {
                        "연번": idx,
                        "구분": row[1] if row[1] else "",
                        "자치구": row[2] if row[2] else "",
                        "호": row[3] if row[3] else "",
                        "주택명": row[4] if row[4] else "",
                        "주소": row[5] if row[5] else "",
                        "주택형": row[6] if row[6] else "",
                        "주택구조": row[7] if row[7] else "",
                        "성별": row[8] if row[8] else "",
                        "전용면적": row[9] if row[9] else ""
                    }

                    # 2~3순위 청년 보증금/임대료 (컬럼 14, 15 or 15, 16)
                    # PDF 구조: 1순위(보증금,임대료,보증금,임대료), 2~3순위(보증금,임대료,보증금,임대료)
                    # 청년 기준: 2~3순위의 첫번째 보증금/임대료
                    try:
                        # 컬럼 인덱스 확인 (PDF 구조에 따라 조정)
                        # 10: 1순위 청년 보증금, 11: 1순위 청년 임대료
                        # 12: 1순위 대학생 보증금, 13: 1순위 대학생 임대료
                        # 14: 2~3순위 청년 보증금, 15: 2~3순위 청년 임대료
                        # 16: 2~3순위 대학생 보증금, 17: 2~3순위 대학생 임대료

                        deposit_idx = 14  # 2~3순위 청년 보증금
                        rent_idx = 15     # 2~3순위 청년 임대료

                        if len(row) > rent_idx:
                            deposit_str = row[deposit_idx] if row[deposit_idx] else "0"
                            rent_str = row[rent_idx] if row[rent_idx] else "0"

                            # 숫자만 추출
                            deposit = int(re.sub(r'[^\d]', '', deposit_str)) if deposit_str else 0
                            rent = int(re.sub(r'[^\d]', '', rent_str)) if rent_str else 0

                            prop["보증금"] = deposit
                            prop["임대료"] = rent
                        else:
                            prop["보증금"] = 0
                            prop["임대료"] = 0

                    except (IndexError, ValueError) as e:
                        print(f"Row {idx} parsing error: {e}, row length: {len(row)}")
                        prop["보증금"] = 0
                        prop["임대료"] = 0

                    properties.append(prop)

    return properties

def main():
    pdf_path = "/Users/edwin/Documents/map_app/2_ [주택목록] 2025년 2차 청년 매입임대주택 입주자모집 주택목록(홈페이지 공개용).pdf"

    print("PDF 파싱 중...")
    raw_data = parse_pdf(pdf_path)
    print(f"총 {len(raw_data)}개 데이터 추출")

    # 주소별로 그룹화하여 좌표 캐싱
    address_coords = {}

    print("\n주소 좌표 변환 중...")
    unique_addresses = set(p["주소"] for p in raw_data if p["주소"])
    print(f"고유 주소 {len(unique_addresses)}개")

    for i, addr in enumerate(unique_addresses):
        if addr not in address_coords:
            lat, lng = geocode_address(addr)
            address_coords[addr] = (lat, lng)
            if (i + 1) % 10 == 0:
                print(f"  {i + 1}/{len(unique_addresses)} 완료")
            time.sleep(0.1)  # API 제한 방지

    # JSON 형식으로 변환
    properties = []
    for i, p in enumerate(raw_data):
        addr = p["주소"]
        lat, lng = address_coords.get(addr, (None, None))

        # 전용면적 파싱
        try:
            area = float(re.sub(r'[^\d.]', '', str(p["전용면적"]))) if p["전용면적"] else 0
        except:
            area = 0

        prop = {
            "id": i + 1,
            "district": p["자치구"],
            "propertyId": p["주택명"],
            "address": p["주소"],
            "unit": p["호"],
            "housingType": p["주택형"],
            "structure": p["주택구조"],
            "gender": p["성별"] if p["성별"] and p["성별"] != "-" else "",
            "exclusiveArea": area,
            "deposit": p["보증금"],
            "monthlyRent": p["임대료"],
            "supplyType": p["구분"],
            "lat": lat,
            "lng": lng
        }
        properties.append(prop)

    # JSON 파일 저장
    output_path = "/Users/edwin/Documents/map_app/data/properties.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(properties, f, ensure_ascii=False, indent=2)

    print(f"\n저장 완료: {output_path}")
    print(f"총 {len(properties)}개 매물")

    # 좌표 없는 항목 확인
    no_coords = [p for p in properties if not p["lat"] or not p["lng"]]
    if no_coords:
        print(f"\n주의: 좌표 없는 매물 {len(no_coords)}개")
        for p in no_coords[:5]:
            print(f"  - {p['address']}")

if __name__ == "__main__":
    main()
