#!/usr/bin/env python3
"""
매물 주소 지오코딩 스크립트
data/properties.json의 좌표(lat/lng)가 없는 매물에 좌표를 추가합니다.

사용법: python3 geocode_properties.py
필요 환경변수: KAKAO_LOCAL_API_KEY (.env.local에 설정)
"""

import json
import re
import requests
import time
import os
from dotenv import load_dotenv

load_dotenv('.env.local')

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "properties.json")


def clean_address(address):
    """주소에서 괄호 부분 및 동 번호 등 제거하여 도로명 주소만 남김"""
    cleaned = re.sub(r'\s*\([^)]*\)', '', address)
    cleaned = re.sub(r'\s+제?\d+동$', '', cleaned)
    cleaned = re.sub(r'\s+[가-힣]동$', '', cleaned)
    cleaned = re.sub(r'\s+[A-Z]동$', '', cleaned)
    cleaned = re.sub(r',\s*[^,]+$', '', cleaned)
    return cleaned.strip()


def geocode_kakao(address):
    """Kakao Local API로 지오코딩"""
    api_key = os.environ["KAKAO_LOCAL_API_KEY"]
    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {api_key}"}
    params = {"query": address}

    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        data = response.json()

        if data.get("documents"):
            doc = data["documents"][0]
            if doc.get("road_address"):
                return float(doc["road_address"]["y"]), float(doc["road_address"]["x"])
            elif doc.get("address"):
                return float(doc["address"]["y"]), float(doc["address"]["x"])
            else:
                return float(doc["y"]), float(doc["x"])
    except Exception as e:
        print(f"  API 오류: {e}")

    return None, None


def geocode_address(address):
    """주소를 좌표로 변환 (클린 주소 → 원본 주소 순으로 시도)"""
    cleaned = clean_address(address)

    lat, lng = geocode_kakao(cleaned)
    if lat and lng:
        return lat, lng

    lat, lng = geocode_kakao(address)
    if lat and lng:
        return lat, lng

    return None, None


def main():
    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        properties = json.load(f)

    # 좌표가 없는 매물만 처리
    needs_geocoding = [p for p in properties if not p.get("lat") or not p.get("lng")]
    if not needs_geocoding:
        print("모든 매물에 좌표가 있습니다.")
        return

    print(f"좌표 없는 매물: {len(needs_geocoding)}개 / 전체 {len(properties)}개")

    # 주소별 좌표 캐싱
    address_coords = {}
    unique_addresses = list(set(p["address"] for p in needs_geocoding))
    print(f"고유 주소 {len(unique_addresses)}개\n")

    success_count = 0
    failed_list = []

    for i, addr in enumerate(unique_addresses):
        lat, lng = geocode_address(addr)
        address_coords[addr] = (lat, lng)

        status = "OK" if lat else "FAIL"
        if lat:
            success_count += 1
        else:
            failed_list.append(addr)

        print(f"  [{i+1}/{len(unique_addresses)}] {status} - {addr[:60]}")
        time.sleep(0.2)

    print(f"\n주소 변환 성공: {success_count}/{len(unique_addresses)}")

    # 좌표 할당
    assigned = 0
    for p in properties:
        if not p.get("lat") or not p.get("lng"):
            coords = address_coords.get(p["address"])
            if coords and coords[0]:
                p["lat"], p["lng"] = coords
                assigned += 1

    print(f"좌표 할당: {assigned}개")

    if failed_list:
        print(f"\n좌표 변환 실패 ({len(failed_list)}개):")
        for addr in failed_list:
            print(f"  - {addr}")

    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(properties, f, ensure_ascii=False, indent=2)

    print(f"\n저장 완료: {DATA_PATH}")


if __name__ == "__main__":
    main()
