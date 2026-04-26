"""
Cloudflare R2 storage integration (standalone, no Streamlit dependency).

Configuration is read exclusively from environment variables:
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT
"""

import os
import json
from io import BytesIO
from functools import lru_cache

import pandas as pd

try:
    import boto3
except ImportError:  # pragma: no cover
    boto3 = None


R2_URI_PREFIX = "r2://"


def get_r2_config():
    """Resolve R2 credentials from environment variables."""
    return {
        "account_id": os.getenv("R2_ACCOUNT_ID", ""),
        "access_key_id": os.getenv("R2_ACCESS_KEY_ID", ""),
        "secret_access_key": os.getenv("R2_SECRET_ACCESS_KEY", ""),
        "bucket": os.getenv("R2_BUCKET", ""),
        "endpoint": os.getenv("R2_ENDPOINT", ""),
    }


def is_r2_configured(config=None):
    if config is None:
        config = get_r2_config()
    required = ["access_key_id", "secret_access_key", "bucket", "endpoint"]
    return all(config.get(k, "").strip() for k in required)


def is_r2_uri(value):
    return isinstance(value, str) and value.startswith(R2_URI_PREFIX)


def key_to_r2_uri(key):
    return f"{R2_URI_PREFIX}{key}"


def r2_uri_to_key(uri):
    return uri[len(R2_URI_PREFIX):] if is_r2_uri(uri) else uri


def source_filename(source):
    key_or_path = r2_uri_to_key(source) if is_r2_uri(source) else source
    return os.path.basename(str(key_or_path))


def source_is_cloud(source):
    return is_r2_uri(source)


def source_label(source):
    name = source_filename(source)
    return f"{name} ☁️" if source_is_cloud(source) else name


def make_r2_client(config):
    if boto3 is None:
        raise RuntimeError("boto3 is required for R2 access. pip install boto3")
    return boto3.client(
        "s3",
        endpoint_url=config["endpoint"],
        aws_access_key_id=config["access_key_id"],
        aws_secret_access_key=config["secret_access_key"],
        region_name="auto",
    )


def list_r2_parquet_keys(config, sport_key):
    if not is_r2_configured(config):
        return []

    client = make_r2_client(config)
    prefix = f"parquet/{sport_key}/"
    keys = []
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=config["bucket"], Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj.get("Key", "")
            if key.lower().endswith(".parquet"):
                keys.append(key)
    return sorted(keys)


def read_r2_parquet(config, key):
    client = make_r2_client(config)
    resp = client.get_object(Bucket=config["bucket"], Key=key)
    payload = resp["Body"].read()
    return pd.read_parquet(BytesIO(payload))


def r2_object_exists(config, key):
    client = make_r2_client(config)
    try:
        client.head_object(Bucket=config["bucket"], Key=key)
        return True
    except Exception:
        return False


def upload_parquet_dataframe(config, key, df):
    """Upload a DataFrame as parquet bytes to R2. Returns size in bytes."""
    client = make_r2_client(config)
    payload = BytesIO()
    df.to_parquet(payload, index=False)
    data = payload.getvalue()
    client.put_object(
        Bucket=config["bucket"],
        Key=key,
        Body=data,
        ContentType="application/octet-stream",
    )
    return len(data)


def read_r2_json(config, key):
    client = make_r2_client(config)
    resp = client.get_object(Bucket=config["bucket"], Key=key)
    payload = resp["Body"].read()
    if not payload:
        return {}
    return json.loads(payload.decode("utf-8"))


def write_r2_json(config, key, data):
    client = make_r2_client(config)
    payload = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    client.put_object(
        Bucket=config["bucket"],
        Key=key,
        Body=payload,
        ContentType="application/json",
    )


def delete_r2_object(config, key):
    client = make_r2_client(config)
    client.delete_object(Bucket=config["bucket"], Key=key)
