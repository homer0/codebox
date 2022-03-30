#!/bin/sh

sed -i.bak "s/throw new AggregateError/console.log\(err\);\nthrow new AggregateError/" ./node_modules/@eclass/semantic-release-docker/src/prepare.js
