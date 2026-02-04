#!/usr/bin/env python3
"""
주소에 좌표 추가하는 스크립트
Nominatim (OpenStreetMap) 무료 지오코딩 사용
"""

import json
import re
import requests
import time

def clean_address(address):
    """주소에서 괄호 부분 제거하고 정리"""
    # 괄호와 그 내용 제거
    cleaned = re.sub(r'\s*\([^)]*\)', '', address)
    # 건물명 제거 (예: ", 홍원하이빌강북7")
    cleaned = re.sub(r',\s*[^,]+$', '', cleaned)
    # 동/필지 제거
    cleaned = re.sub(r'\s+외\s+\d+필지', '', cleaned)
    return cleaned.strip()

def geocode_nominatim(address):
    """Nominatim API로 지오코딩"""
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": address,
        "format": "json",
        "limit": 1,
        "countrycodes": "kr"
    }
    headers = {
        "User-Agent": "YouthHousing/1.0 (housing.app@example.com)"
    }

    try:
        response = requests.get(url, params=params, headers=headers, timeout=10)
        results = response.json()

        if results:
            return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as e:
        pass

    return None, None

def geocode_address(address):
    """주소를 좌표로 변환"""
    # 원본 주소로 시도
    lat, lng = geocode_nominatim(address)
    if lat and lng:
        return lat, lng

    # 괄호 제거한 주소로 시도
    cleaned = clean_address(address)
    if cleaned != address:
        lat, lng = geocode_nominatim(cleaned)
        if lat and lng:
            return lat, lng

    # 도로명만 추출하여 시도 (구까지)
    road_match = re.match(r'(서울특별시\s+\S+구\s+\S+\s+[\d-]+)', address)
    if road_match:
        road_only = road_match.group(1)
        lat, lng = geocode_nominatim(road_only)
        if lat and lng:
            return lat, lng

    # 구 레벨로 시도
    gu_match = re.match(r'(서울특별시\s+\S+구)', address)
    if gu_match:
        gu_only = gu_match.group(1)
        lat, lng = geocode_nominatim(gu_only)
        if lat and lng:
            return lat, lng

    return None, None

def main():
    # 기존 데이터 로드
    input_path = "/Users/edwin/Documents/map_app/data/properties.json"
    with open(input_path, 'r', encoding='utf-8') as f:
        properties = json.load(f)

    print(f"총 {len(properties)}개 매물 좌표 추가 중...")

    # 주소별로 좌표 캐싱
    address_coords = {}

    # 고유 주소 추출
    unique_addresses = list(set(p["address"] for p in properties if p["address"]))
    print(f"고유 주소 {len(unique_addresses)}개\n")

    # 좌표 변환
    for i, addr in enumerate(unique_addresses):
        lat, lng = geocode_address(addr)
        address_coords[addr] = (lat, lng)
        status = "O" if lat else "X"
        print(f"[{status}] {i + 1}/{len(unique_addresses)}: {clean_address(addr)[:40]}")
        time.sleep(1.1)  # Nominatim 사용 제한 (1초당 1회)

    # 좌표 할당
    success_count = 0
    for p in properties:
        if p["address"] in address_coords:
            lat, lng = address_coords[p["address"]]
            if lat and lng:
                p["lat"] = lat
                p["lng"] = lng
                success_count += 1

    print(f"\n좌표 변환 성공: {success_count}/{len(properties)}")

    # 실패한 주소 목록
    failed_addresses = [addr for addr, (lat, lng) in address_coords.items() if not lat]
    if failed_addresses:
        print(f"\n좌표 변환 실패한 주소 ({len(failed_addresses)}개)")

    # 저장
    output_path = "/Users/edwin/Documents/map_app/data/properties.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(properties, f, ensure_ascii=False, indent=2)

    print(f"\n저장 완료: {output_path}")

if __name__ == "__main__":
    main()
