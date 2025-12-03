#!/bin/bash
# read by lines
IFS=$'\n'

for COUNTY in $(cat ./data/lists/county.names); do
    #echo $COUNTY
	countyFile=${COUNTY// /}
	countyFile=${countyFile,,}
	#echo $countyFile
	cmd="wget -O ways_${countyFile}.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:45];area[name=%22California%22]->.big;area[name=%22${COUNTY}%22]->.small;way[%22highway%22~%22^(trunk|primary|secondary|tertiary|unclassified|residential)$%22][%22name%22](area.big)(area.small)->.streets;.streets out geom;'"
	echo $cmd
	#eval $cmd
done