#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 5 ]; then
  echo "Usage: $0 <source1_url> <source2_url> <source3_url> <source4_url> <source5_url>"
  exit 1
fi

s1="$1"
s2="$2"
s3="$3"
s4="$4"
s5="$5"

for f in content/mindmaps/part-*.mdx content/mindmaps/surah-*.mdx; do
  S1="$s1" S2="$s2" S3="$s3" S4="$s4" S5="$s5" \
    perl -0pi -e 's#https://SOURCE_FILE_1_URL#$ENV{S1}#g; s#https://SOURCE_FILE_2_URL#$ENV{S2}#g; s#https://SOURCE_FILE_3_URL#$ENV{S3}#g; s#https://SOURCE_FILE_4_URL#$ENV{S4}#g; s#https://SOURCE_FILE_5_URL#$ENV{S5}#g' "$f"
done

echo "Updated source links in part/surah mindmap docs."
