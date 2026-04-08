#!/bin/bash
# Install mongodump if not present
if ! command -v mongodump &> /dev/null; then
  apt-get install -y mongodb-database-tools 2>/dev/null || \
  wget -q https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-x86_64-100.9.4.tgz \
    -O /tmp/mongo-tools.tgz && tar -xzf /tmp/mongo-tools.tgz -C /tmp && \
    export PATH=$PATH:/tmp/mongodb-database-tools-ubuntu2204-x86_64-100.9.4/bin
fi

node scripts/backup.js
