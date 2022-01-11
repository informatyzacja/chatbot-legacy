#!/usr/bin/env bash
set -o errexit
set -o nounset
set -o pipefail
set -o xtrace

#
# Variables
#
SPREADSHEET_ID='1z4sa4K54l5WGXcYj0Fi73Pb5euX5HBHxlvnykNBeAnE'
SHEET_ID='1396758614'

SHEET_URL="https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export"
SHEET_URL+="?format=csv&id=${SPREADSHEET_ID}&gid=${SHEET_ID}"

OUTPUT_FILE='response_config.json'


#
# Fetch the file
#
curl --silent --location "${SHEET_URL}" \
    | sed -e 's#""#"#g' \
          -e 's#^"{$#{#g' \
          -e 's#^}"$#}\n#g' \
    | tee "${OUTPUT_FILE}"
