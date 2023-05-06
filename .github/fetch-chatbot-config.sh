#!/usr/bin/env bash
set -o errexit
set -o nounset
set -o pipefail
set -o xtrace

#
# Variables
#
SPREADSHEET_ID='1nfjNC4MWmt6XItyb7r9eoAgB2nquvzNlwNJyIG6N27o'
SHEET_ID='556175424'

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
