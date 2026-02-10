import os
from io import BytesIO

import pandas as pd

try:
    import boto3
except ImportError:  # pragma: no cover
    boto3 = None


R2_URI_PREFIX = "r2://"


def get_r2_config(secrets=None):
    """
    Resolve R2 credentials from Streamlit secrets first, then environment variables.
    Returns empty strings for missing values so callers can check configuration validity.
    """
    def read_value(key):
        if secrets is not None:
            try:
                value = secrets.get(key)
                if value:
                    return str(value)
            except Exception:
                pass
        return os.getenv(key, "")

    return {
        "account_id": read_value("R2_ACCOUNT_ID"),
        "access_key_id": read_value("R2_ACCESS_KEY_ID"),
        "secret_access_key": read_value("R2_SECRET_ACCESS_KEY"),
        "bucket": read_value("R2_BUCKET"),
        "endpoint": read_value("R2_ENDPOINT"),
    }


def is_r2_configured(config):
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
        raise RuntimeError("boto3 is required for R2 access. Install dependencies from requirements.txt.")
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
