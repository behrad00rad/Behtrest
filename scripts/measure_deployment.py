"""Sample Docker resource usage without dependencies or changes to containers."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', default='behtrest-preview')
    parser.add_argument('--samples', type=int, default=6)
    parser.add_argument('--interval', type=float, default=10)
    parser.add_argument('--output', type=Path, default=Path('resource-report.json'))
    args = parser.parse_args()
    if not 1 <= args.samples <= 360 or not 0 <= args.interval <= 60:
        parser.error('Use 1–360 samples and a 0–60 second interval.')
    ids = subprocess.check_output(['docker', 'ps', '-q', '--filter', f'label=com.docker.compose.project={args.project}'], text=True).split()
    if not ids:
        parser.error('No running containers found for this project. Nothing measured.')
    report = {'project': args.project, 'started_at': datetime.now(timezone.utc).isoformat(), 'samples': []}
    for index in range(args.samples):
        output = subprocess.check_output(['docker', 'stats', '--no-stream', '--format', '{{json .}}', *ids], text=True)
        report['samples'].append({'time': datetime.now(timezone.utc).isoformat(), 'containers': [json.loads(line) for line in output.splitlines() if line.strip()]})
        if index + 1 < args.samples:
            time.sleep(args.interval)
    args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'{len(report["samples"])} resource snapshots saved to {args.output}. Includes CPU, memory, network and block I/O; no request data.')


if __name__ == '__main__':
    main()
