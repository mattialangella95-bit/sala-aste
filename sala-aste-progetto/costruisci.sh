#!/bin/bash
set -e
cd "$(dirname "$0")"
./node_modules/.bin/esbuild src/main.jsx --bundle --minify --format=iife \
  --define:process.env.NODE_ENV='"production"' --outfile=build/app.js --loader:.js=jsx
./node_modules/.bin/esbuild src/utilita.css --minify --outfile=build/app.css
node inserisci.js
echo "fatto, guarda dist/index.html"
