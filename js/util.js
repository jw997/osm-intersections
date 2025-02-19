import { getJson } from "./utils_helper.js";

// touch or mouse?
let mql = window.matchMedia("(pointer: fine)");
const pointerFine = mql.matches;


function getMarkerOpt() {
	const colorValue = w3_highway_red;
	var rad = 3;
	var opa = 0.5;

	const retval = {
		color: colorValue,
		radius: rad,
		fill: true,
		fillOpacity: opa
	};
	return retval;
}
function getOptionsForSeverity(sev) {
	var colorValue;
	var rad = 6;
	var opa = 0.5;

	switch (sev) {
		case 'Fatal':
			colorValue = w3_highway_red;
			rad = 10;
			opa = 1;
			break;
		case "Serious Injury":
			colorValue = w3_highway_orange;
			rad = 8;
			opa = 1;
			break;
		case "Minor Injury":
			colorValue = w3_highway_brown;
			opa = 1;
			break;
		case "Possible Injury":
			colorValue = w3_highway_yellow;
			break;
		case "No Injury":
			colorValue = w3_highway_blue;
			break;
		case "Unspecified Injury":
			colorValue = violet;
			break;
		default:
			console.error("Unexpected Injury severity ", sev);
	}
	if (!pointerFine) {
		rad *= 1.5;
	}
	const retval = {
		color: colorValue,
		radius: rad,
		fill: true,
		fillOpacity: opa
	};
	return retval;

}

function getIcon(name) {
	const icon = new L.Icon({
		//	iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/' + name,
		iconUrl: './images/' + name,
		//	shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
		shadowUrl: './images/marker-shadow.png',
		iconSize: [25, 41],
		iconAnchor: [12, 41],
		popupAnchor: [1, -34],
		shadowSize: [41, 41]
	});
	return icon;

}

const greenIcon = getIcon('marker-highway-green.png');
const redIcon = getIcon('marker-highway-red.png');
const orangeIcon = getIcon('marker-highway-orange.png');
const yellowIcon = getIcon('marker-highway-yellow.png');
const goldIcon = getIcon('marker-highway-brown.png');
const blueIcon = getIcon('marker-highway-blue.png');
const violetIcon = getIcon('marker-icon-violet.png');



const w3_highway_brown = '#633517';
const w3_highway_red = '#a6001a';
const w3_highway_orange = '#e06000';
const w3_highway_schoolbus = '#ee9600';
const w3_highway_yellow = '#ffab00';
const w3_highway_green = '#004d33';
const w3_highway_blue = '#00477e';

const violet = "#9400d3";//"#EE82EE";

const black = "#000000";

const grey = "#101010";

async function getCityBoundary() {
	const file = './data/cityboundary/Land_Boundary.geojson';
	const cityGeoJson = await getJson(file);
	return cityGeoJson;
}

const cityGeoJson = await getCityBoundary();

async function getIntersections() {
	const file = './data/intersections.json';
	const interJson = await getJson(file);
	return interJson;
}

const interJson = await getIntersections();



const popupFields = ['Date',
	'Time', 'Hour',
	//'Day_of_Week',
	'Case_Number',
	'Case_ID',
	'Local_Report_Number',
	'Accident_Location',
	'Latitude',
	'Longitude',
	'Collision_Classification_Descri',
	'Collision_Type',
	'Primary_Collision_Factor_Code',
	'PCF_Description',
	//	'PCF_Category',
	'Involved_Objects',
	'Involved_Parties',
	'Party_at_Fault',
	'Number_of_Injuries',
	'Number_of_Fatalities',
	'Suspected_Serious_Injury',
	'Injury_Severity',
	"Injury_Ages",
	"url",
	"Traffic_Violation_Offense_Code_",
	"Type_Of_Stop", "bGeoPointAddress", "bGeneralLocationDesc",
	"ReasonForStopNarrative",
	"Result_of_Stop_text",
	"Stop_Location"


];
function collisionPopup(obj) {
	var msg = "";
	for (const k of popupFields) {
		const v = obj[k];
		if (v) {
			msg += (k + ': ' + v + '<br>');
		}
	}
	return msg;
}

var map;

function createMap() {
	// Where you want to render the map.
	var element = document.getElementById('osm-map');
	// Height has to be set. You can do this in CSS too.
	//element.style = 'height:100vh;';
	// Create Leaflet map on map element.
	map = L.map(element, {
		preferCanvas: true
	});
	// Add OSM tile layer to the Leaflet map.
	L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
		attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
	}).addTo(map);
	// Target's GPS coordinates.
	var target = L.latLng('37.87', '-122.27'); // berkeley 37°52′18″N 122°16′22″W
	// Set map's center to target with zoom 14.
	map.setView(target, 14);
	// add geojson precincts to map
}




createMap();


// add city boundary to map
L.geoJSON(cityGeoJson, { fillOpacity: 0.05 }).addTo(map);

const resizeObserver = new ResizeObserver(() => {
	console.log("resize observer fired");
	map.invalidateSize();
});

resizeObserver.observe(document.getElementById('osm-map'));


// keep track of markers for removal
const markers = [];

function removeAllMakers() {
	for (const m of markers) {
		m.remove();
	}
}

const LatitudeDefault = 37.868412;
const LongitudeDefault = -122.349938;

/*
 {
	  "coordinates": [
		37.868524,
		-122.2454645
	  ],
	  "streets": "Dwight Way/Panoramic Way"
	},

*/

function addMarkers(intersections) {
	removeAllMakers();
	const markersAtLocation = new Map();
	// add collisions to map
	var markerCount = 0
	var skipped = 0, plotted = 0;

	var arrMappedCollisions = [];

	for (const intersection of intersections) {
		
		plotted++;
		//arrMappedCollisions.push(attr); // add to array for export function




		const loc = intersection.coordinates;
		const lat = intersection.coordinates[0];
		const long = intersection.coordinates[1];

		//	const roundLoc = loc.map((c) => c.toFixed(3));
		const ct = markersAtLocation.get(JSON.stringify(loc)) ?? 0;

		if (ct > 0) {
			console.log("adjusting marker")
		}

		const opt = getMarkerOpt();

		var marker;

		marker = L.circleMarker([lat + ct * 0.0001, long - ct * 0.0001], opt

		);



		markersAtLocation.set(JSON.stringify(loc), ct + 1);
		var msg = intersection.streets;



		if (pointerFine) {

			marker.bindTooltip(msg).openTooltip(); 
			marker.bindPopup(msg).openPopup();
		} else {
			marker.bindPopup(msg).openPopup();
		}

		marker.addTo(map);
		markers.push(marker);
		markerCount++;

	}
	console.log('Skipped', skipped);
	console.log('Plotted', plotted);
	console.log("markerCount ", markerCount)

}

addMarkers(interJson.intersections);

export {

	map
};