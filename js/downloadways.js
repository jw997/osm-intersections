'use strict';

import { readFileSync, writeFileSync } from 'fs';
import { access, constants } from 'node:fs/promises';

for (let j = 0; j < process.argv.length; j++) {
	console.log(j + ' -> ' + (process.argv[j]));
}

function fileNameIze(str) {
	return str.replaceAll(' ', '_').replaceAll('/', '_');
}

async function sleep(seconds) {
	await new Promise(r => setTimeout(r, seconds * 1000));
}

async function fileExists(fileName) {
	try {
		await access(fileName, constants.R_OK | constants.W_OK);
		//console.log('can access');
		return true
	  } catch {
		//console.error('cannot access');
		return false
	  } 
}

var test = await fileExists('output/ways_Albany.json')
test = await fileExists('output/fake')

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
const GATEWAY_TIMEOUT=504

async function getJson(url, maxretries) {
	try {
		var response = await fetch(url);
		while ((GATEWAY_TIMEOUT == response.status) &&  maxretries >0) {
			sleep(10);
			maxretries--;
			response = await fetch(url);
		}
		if (!response.ok) {

			throw new Error(`Response status: ${response.status}`);

		}
		const json = await response.json();
		sleep(5);
		return json;
	} catch (error) {
		console.error(error.message);
	}
}


const countyJsonFile = './data/county_cities.json';
const str = readFileSync(countyJsonFile)
const countyJson = JSON.parse(str)
/*
 {
	"countyName": "Amador County",
	"cityNames": [
	  "Amador City",
	  "Ione",
	  "Jackson",
	  "Plymouth",
	  "Sutter Creek"
	],
	"countCode": 3
  },
*/



async function onePlace(placeName) {
	

	const outputFile = './output/ways_' + fileNameIze(placeName) + '.json';
	const alreadyExists = await fileExists(outputFile)
	if (alreadyExists) {
		console.log("Skipping ", placeName, ' file already exists ', outputFile)
		return;
	}
	console.log("Trying ", placeName)
	const overpassQueryStr =
		`[out:json][timeout:100];area[name="California"]->.big;area[name="${placeName}"]->.small;(way["highway"~"^(motorway|motorway_link|trunk|primary|secondary|tertiary|unclassified|residential)$"]["name"](area.big)(area.small);way["highway"~"^(motorway|motorway_link|trunk|primary|secondary|tertiary|unclassified|residential)$"]["ref"](area.big)(area.small);way["highway"~"^(motorway|motorway_link|trunk|primary|secondary|tertiary|unclassified|residential)$"]["junction"](area.big)(area.small);way["highway"="motorway_link"](area.big)(area.small);); out geom;`

	const url = 'https://www.overpass-api.de/api/interpreter?data=' + overpassQueryStr;
	const obj = await getJson(url,3);

	const str = JSON.stringify(obj);

	writeFileSync(outputFile, str);
}

const placeNames = [];
const placeNameArg = process.argv[2];

if (placeNameArg) {
	placeNames.push(placeNameArg)
} else {
	for (const row of countyJson) {
		placeNames.push(row.countyName)
	}
}

for (const place of placeNames) {
	await onePlace(place)
}


console.log("bye")