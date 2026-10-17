#!/usr/bin/env python3
"""Read-only HTTP timings, with cold and reused connections kept separate."""
import argparse
import json
from pathlib import Path
import statistics
import subprocess
import sys
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='https://schichtfunk.de')
    parser.add_argument('--output', default='artifacts/site-response.json')
    args = parser.parse_args()
    base = args.base_url.rstrip('/')
    url = urlparse(base)
    if url.username or url.password or url.query or url.fragment or (
        url.scheme != 'https' and not (url.scheme == 'http' and url.hostname in ('127.0.0.1', 'localhost'))
    ):
        parser.error('Use an HTTPS base URL without credentials, query or fragment.')

    paths = ['/favicon.ico', '/assets/employee-portal-polish-v1.js', '/'] * 2
    command = ['curl']
    for index, path in enumerate(paths):
        if index:
            command.append('--next')
        command.extend(['--silent', '--show-error', '--compressed', '--connect-timeout', '10',
                        '--max-time', '20', '--output', '/dev/null', '--write-out', '%{json}\n', base + path])
    result = subprocess.run(command, capture_output=True, text=True, timeout=130)
    samples = []
    for line in result.stdout.splitlines():
        raw = json.loads(line)
        samples.append({
            'url': raw['url_effective'], 'http_status': raw['http_code'],
            'new_connections': raw['num_connects'],
            'tls_seconds': raw['time_appconnect'],
            'first_byte_seconds': raw['time_starttransfer'],
            'after_connection_first_byte_seconds': max(0, raw['time_starttransfer'] - raw['time_pretransfer']),
            'total_seconds': raw['time_total'], 'download_bytes': raw['size_download'],
        })
    warm = [row['first_byte_seconds'] for row in samples if row['new_connections'] == 0 and row['http_status'] == 200]
    ok = result.returncode == 0 and len(samples) == len(paths) and all(row['http_status'] == 200 for row in samples)
    report = {
        'ok': ok, 'base_url': base,
        'conditions': 'Public static files; six GETs in one curl process; compressed responses. No login or database writes. Results describe the runner network, not every user connection.',
        'median_reused_connection_first_byte_seconds': statistics.median(warm) if warm else None,
        'samples': samples, 'transport_error': result.stderr.strip() or None,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
