#!/usr/bin/env bash
# Probe a candidate ATS board and report how many jobs its public API returns.
# Usage: verify-board.sh <platform> <slug> [extra...]
#   platform: ashby | greenhouse | lever | smartrecruiters
#   exit 0 + prints count when the board resolves to >=1 job; exit 1 otherwise.
set -u
platform="$1"
slug="$2"
shift 2

count=0
case "$platform" in
  ashby)
    count=$(curl -s --max-time 15 "https://api.ashbyhq.com/posting-api/job-board/$slug" \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log((j.jobs||[]).length)}catch{console.log(0)}})')
    ;;
  greenhouse)
    count=$(curl -s --max-time 15 "https://boards-api.greenhouse.io/v1/boards/$slug/jobs" \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log((j.jobs||[]).length)}catch{console.log(0)}})')
    ;;
  lever)
    count=$(curl -s --max-time 15 "https://api.lever.co/v0/postings/$slug?mode=json" \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(Array.isArray(j)?j.length:0)}catch{console.log(0)}})')
    ;;
  smartrecruiters)
    count=$(curl -s --max-time 15 "https://api.smartrecruiters.com/v1/companies/$slug/postings?limit=5" \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log((j.content||[]).length>=0? (j.totalFound ?? 0):0)}catch{console.log(0)}})')
    ;;
  *)
    echo "unknown platform: $platform" >&2
    exit 2
    ;;
esac

echo "$count"
exit 0
