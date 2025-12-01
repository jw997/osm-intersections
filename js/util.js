import { getJson } from "./utils_helper.js";

const slash = '/';

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

const countyBoundariesGeoJson = await getJson('./data/osm-boundaries/AlamedaCounty_And_Children.geojson');

/*


*/


async function getIntersections() {
	//const file = './data/intersections.geojson';
	//const file = './data/intersections_berkeley.geojson';
	//const file = './data/intersections_oakland.geojson';
	const file = './data/intersections/intersections_alamedacounty.geojson';
	const interJson = await getJson(file);
	return interJson;
}

// Berkeley
const LatitudeDefault = 37.87;
const LongitudeDefault = -122.27;

/* interesections geojson sample
{
  "type": "FeatureCollection",
  "features": [
	{
	  "type": "Feature",
	  "geometry": {
		"type": "Point",
		"coordinates": [
		  -122.2450524,
		  37.8584661
		]
	  },
	  "properties": {
		"streets": [
		  "Claremont Avenue",
		  "Claremont Boulevard"
		]
	  }
	},

*/

const interJson = await getIntersections();

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
	var target = L.latLng(LatitudeDefault, LongitudeDefault); // berkeley 37°52′18″N 122°16′22″W
	// Set map's center to target with zoom 14.
	map.setView(target, 14);
	// add geojson precincts to map
}

createMap();

// add city boundary to map
//L.geoJSON(cityGeoJson, { fillOpacity: 0.05 }).addTo(map);

for (const boundaryFeature of countyBoundariesGeoJson.features) {
	const prop = boundaryFeature.properties;
	const name = prop.name;
	if (prop.boundary == 'administrative') {
		console.log("level ", prop.admin_level, name);
		if (8 == prop.admin_level) { // cities only
			L.geoJSON(boundaryFeature, { fillOpacity: 0.05 }).bindPopup(name).addTo(map);
		}
	}
}

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

function addMarkers(intersections) {
	removeAllMakers();
	//const markersAtLocation = new Map();
	// add collisions to map
	var markerCount = 0
	//var skipped = 0, plotted = 0;


	for (const intersection of intersections) {

		const loc = intersection.geometry.coordinates;
		const lat = loc[1];
		const long = loc[0];

		const opt = getMarkerOpt();

		var marker = L.circleMarker([lat, long], opt

		);


		var msg = intersection.properties.streets.join(slash);

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
	console.log("markerCount ", markerCount)
}

addMarkers(interJson.features);

export {
	map
};