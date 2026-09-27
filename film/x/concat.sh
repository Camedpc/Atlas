#!/bin/bash
set -euo pipefail
ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i liste.txt -c copy video_muette.tmp.mp4
mv -f video_muette.tmp.mp4 video_muette.mp4
