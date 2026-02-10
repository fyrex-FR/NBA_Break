import argparse
from pathlib import Path

from r2_storage import get_r2_config, is_r2_configured, make_r2_client


def iter_parquet_files(root_dir):
    root = Path(root_dir)
    for path in sorted(root.rglob("*.parquet")):
        if path.is_file():
            yield path


def main():
    parser = argparse.ArgumentParser(description="Upload local parquet files to Cloudflare R2.")
    parser.add_argument("--input-dir", default="checklists_parquet", help="Local parquet root folder.")
    parser.add_argument(
        "--prefix",
        default="parquet",
        help="R2 key prefix. Example: parquet -> parquet/nba/file.parquet",
    )
    parser.add_argument("--dry-run", action="store_true", help="Show operations without uploading.")
    args = parser.parse_args()

    config = get_r2_config()
    if not is_r2_configured(config):
        raise SystemExit(
            "R2 not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_ENDPOINT."
        )

    client = make_r2_client(config)
    input_root = Path(args.input_dir)
    if not input_root.exists():
        raise SystemExit(f"Input directory not found: {input_root}")

    uploaded = 0
    total_size = 0
    for local_path in iter_parquet_files(input_root):
        relative = local_path.relative_to(input_root).as_posix()
        key = f"{args.prefix.strip('/')}/{relative}"
        size = local_path.stat().st_size
        total_size += size

        if args.dry_run:
            print(f"DRY  {local_path} -> s3://{config['bucket']}/{key} ({size} bytes)")
            continue

        client.upload_file(str(local_path), config["bucket"], key)
        uploaded += 1
        print(f"OK   {local_path} -> s3://{config['bucket']}/{key} ({size} bytes)")

    if args.dry_run:
        print(f"\nDry run complete. Files: {sum(1 for _ in iter_parquet_files(input_root))}")
    else:
        print(f"\nUpload complete. Files: {uploaded} | Total bytes: {total_size}")


if __name__ == "__main__":
    main()
