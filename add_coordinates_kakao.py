#!/usr/bin/env python3
"""
지오코딩 스크립트 - 여러 API 사용
"""

import json
import re
import requests
import time
import sys
import os
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv('.env.local')

def clean_address(address):
    """주소에서 괄호 부분 및 동/B동 등 제거"""
    # 괄호와 그 내용 제거
    cleaned = re.sub(r'\s*\([^)]*\)', '', address)
    # A동, B동 등 제거
    cleaned = re.sub(r'\s+[A-Z]동$', '', cleaned)
    # 101동, 102동 등 제거
    cleaned = re.sub(r'\s+\d+동$', '', cleaned)
    # 가동, 나동 등 제거
    cleaned = re.sub(r'\s+[가-힣]동$', '', cleaned)
    # 건물명 제거 (마지막 콤마 이후)
    cleaned = re.sub(r',\s*[^,]+$', '', cleaned)
    return cleaned.strip()

def geocode_juso(address):
    """주소기반산업지원서비스 API (한국 정부 무료 API)"""
    # confmKey는 https://www.juso.go.kr/addrlink/devAddrLinkRequestWrite.do 에서 발급
    # 일 10만건 무료
    confm_key = os.environ["JUSO_CONFM_KEY"]

    # 1단계: 주소 검색
    url = "https://business.juso.go.kr/addrlink/addrLinkApi.do"
    params = {
        "confmKey": confm_key,
        "currentPage": "1",
        "countPerPage": "1",
        "keyword": address,
        "resultType": "json"
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()

        results = data.get("results", {})
        if results.get("common", {}).get("errorCode") == "0":
            juso_list = results.get("juso", [])
            if juso_list:
                juso = juso_list[0]
                # 좌표 변환 API 호출
                return geocode_juso_coord(juso.get("admCd"), juso.get("rnMgtSn"), juso.get("udrtYn", "0"), juso.get("buldMnnm", "0"), juso.get("buldSlno", "0"))
    except Exception as e:
        pass

    return None, None

def geocode_juso_coord(admCd, rnMgtSn, udrtYn, buldMnnm, buldSlno):
    """주소기반산업지원서비스 좌표 변환 API"""
    confm_key = os.environ["JUSO_CONFM_KEY"]

    url = "https://business.juso.go.kr/addrlink/addrCoordApi.do"
    params = {
        "confmKey": confm_key,
        "admCd": admCd,
        "rnMgtSn": rnMgtSn,
        "udrtYn": udrtYn,
        "buldMnnm": buldMnnm,
        "buldSlno": buldSlno,
        "resultType": "json"
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()

        results = data.get("results", {})
        if results.get("common", {}).get("errorCode") == "0":
            juso_list = results.get("juso", [])
            if juso_list:
                juso = juso_list[0]
                lat = float(juso.get("entY", 0))
                lng = float(juso.get("entX", 0))
                if lat and lng:
                    return lat, lng
    except Exception as e:
        pass

    return None, None

def geocode_geoapify(address):
    """Geoapify 무료 지오코딩 API"""
    # 무료 API 키 (일 3000건)
    api_key = os.environ["GEOAPIFY_API_KEY"]
    url = "https://api.geoapify.com/v1/geocode/search"
    params = {
        "text": address,
        "filter": "countrycode:kr",
        "format": "json",
        "apiKey": api_key
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()

        if data.get("results"):
            result = data["results"][0]
            lat = result.get("lat")
            lon = result.get("lon")
            if lat and lon:
                return lat, lon
    except Exception as e:
        pass

    return None, None

def geocode_nominatim(address):
    """Nominatim (OpenStreetMap) 지오코딩"""
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": address,
        "format": "json",
        "limit": 1,
        "countrycodes": "kr"
    }
    headers = {
        "User-Agent": "YouthHousingApp/1.0"
    }

    try:
        response = requests.get(url, params=params, headers=headers, timeout=10)
        results = response.json()

        if results:
            return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as e:
        pass

    return None, None

def geocode_locationiq(address):
    """LocationIQ 무료 지오코딩"""
    api_key = os.environ["LOCATIONIQ_API_KEY"]
    url = "https://us1.locationiq.com/v1/search.php"
    params = {
        "key": api_key,
        "q": address,
        "format": "json",
        "countrycodes": "kr"
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        results = response.json()

        if isinstance(results, list) and results:
            return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as e:
        pass

    return None, None

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
        pass

    return None, None

def geocode_address(address):
    """주소를 좌표로 변환 - Kakao API 사용"""
    cleaned = clean_address(address)

    # 1. Kakao API (가장 정확)
    lat, lng = geocode_kakao(cleaned)
    if lat and lng:
        return lat, lng

    lat, lng = geocode_kakao(address)
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

    # 좌표 변환 with 프로그래스 바
    success_count = 0
    failed_list = []

    pbar = tqdm(unique_addresses, desc="지오코딩", unit="주소",
                bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]')

    for addr in pbar:
        lat, lng = geocode_address(addr)
        address_coords[addr] = (lat, lng)

        if lat:
            success_count += 1
            pbar.set_postfix({"성공": success_count, "실패": len(failed_list)})
        else:
            failed_list.append(addr)
            pbar.set_postfix({"성공": success_count, "실패": len(failed_list)})

        time.sleep(0.3)  # API 제한 방지

    pbar.close()
    print(f"\n주소 변환 성공: {success_count}/{len(unique_addresses)}")

    # 좌표 할당
    property_success = 0
    for p in properties:
        if p["address"] in address_coords:
            lat, lng = address_coords[p["address"]]
            if lat and lng:
                p["lat"] = lat
                p["lng"] = lng
                property_success += 1

    print(f"매물 좌표 할당: {property_success}/{len(properties)}")

    # 실패한 주소 목록
    failed_addresses = [addr for addr, (lat, lng) in address_coords.items() if not lat]
    if failed_addresses:
        print(f"\n좌표 변환 실패한 주소 ({len(failed_addresses)}개):")
        for addr in failed_addresses[:10]:
            print(f"  - {clean_address(addr)[:60]}")
        if len(failed_addresses) > 10:
            print(f"  ... 외 {len(failed_addresses) - 10}개")

    # 저장
    output_path = "/Users/edwin/Documents/map_app/data/properties.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(properties, f, ensure_ascii=False, indent=2)

    print(f"\n저장 완료: {output_path}")

if __name__ == "__main__":
    main()
