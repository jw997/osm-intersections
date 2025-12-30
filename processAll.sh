#!/bin/bash

echo "Matching text files:"

for file in ./input/ways_*.json; do
    echo "$file"
	od=${file//input/output};
	outputFile=${od//ways_/intersections_};
	echo $outputFile
	cmd="node js/geo.js $file $outputFile"
	echo $cmd
	eval $cmd
done