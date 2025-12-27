'use strict';

import { readFileSync, writeFileSync } from 'fs';

for (let j = 0; j < process.argv.length; j++) {
	console.log(j + ' -> ' + (process.argv[j]));
}

function fileNameIze(str) {
	return str.replaceAll(' ', '_').replaceAll('/', '_');
}

var lastTime = 0;
function getMS(msg) {
	const thisTime = Date.now();
	const diff = thisTime - lastTime;
	lastTime = thisTime;

	if (msg) {
		console.log(msg, ':', diff, ' ms')
	}
	return diff;
}

async function getJson(url) {
	try {
		const response = await fetch(url); // {cache: 'no-cache'} https://hacks.mozilla.org/2016/03/referrer-and-cache-control-apis-for-fetch/
		if (!response.ok) {
			throw new Error(`Response status: ${response.status}`);
		}

		const json = await response.json();
		return json;
	} catch (error) {
		console.error(error.message);
	}
}




const placeName=process.argv[2] ?? 'Berkeley';

const outputFile='./output/ways_'+fileNameIze(placeName)+'.json';

'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:300];area[name="California"]->.big;area[name="Alpine County"]->.small;way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]["name"](area.big)->.streets;.streets out geom;'

'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:300];area[name="California"]->.big;area[name="Alpine County"]->.small;way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]["name"](area.big)->.streets;.streets out geom;'

const overpassQueryStr = 
`[out:json][timeout:100];area[name="California"]->.big;area[name="${placeName}"]->.small;(way["highway"~"^(motorway|motorway_link|trunk|primary|secondary|tertiary|unclassified|residential)$"]["name"](area.big)(area.small);way["highway"~"^(motorway|motorway_link|trunk|primary|secondary|tertiary|unclassified|residential)$"]["ref"](area.big)(area.small);way["highway"~"^(motorway|motorway_link|trunk|primary|secondary|tertiary|unclassified|residential)$"]["junction"](area.big)(area.small);way["highway"="motorway_link"](area.big)(area.small);); out geom;`

const url = 'https://www.overpass-api.de/api/interpreter?data=' + overpassQueryStr;
const obj = await  getJson(url);
const str = JSON.stringify(obj);

writeFileSync(outputFile, str);

console.log("bye")