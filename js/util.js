import { getJson } from "./utils_helper.js";

const slash = '/';

// touch or mouse?
let mql = window.matchMedia("(pointer: fine)");
const pointerFine = mql.matches;



const selectCounty = document.querySelector('#selectCounty');

const primaryRoad = document.querySelector('#primaryRoad');

const secondaryRoad = document.querySelector('#secondaryRoad');

const filterButton = document.querySelector('#filterButton');



function fileNameIze(str) {
	return str.replaceAll(' ', '_').replaceAll('/', '_');
}

function getMarkerOpt() {
	const colorValue = w3_highway_red;
	var rad = 6;
	var opa = 0.5;

	const retval = {
		color: colorValue,
		radius: rad,
		fill: true,
		fillOpacity: opa
	};
	return retval;
}


// populate the city select
function populateSelect(selectData, select) {

	// remove any existing options
	const optionCount = select.options.length;
	for (let i = 0; i < optionCount; i++) {
		select.options.remove(0)
	}

	for (const datum of selectData) {

		const opt = document.createElement("option");
		opt.value = datum;
		opt.text = datum;  // name is first synonym from streetArray
		select.add(opt, null);
	}
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

//const countyBoundariesGeoJson = await getJson('./data/osm-boundaries/AlamedaCounty_And_Children.geojson');
const countyBoundariesGeoJson = await getJson('./data/osm-boundaries/CaliforniaAndCounties.geojson');


const countyCityJsonFile = './data/county_cities.json';
const countyCityJSON = await getJson(countyCityJsonFile);

const countyCityLocationsJsonFile = './data/CountyCityLocations.json';
const countCityLocationsJson = await getJson(countyCityLocationsJsonFile);

const mapNameToCenter = new Map();


for (const row of countCityLocationsJson) {

	const name = row.name;
	const lat = row.lat;
	const lng = row.lng;

	if (name && lat && lng) {
		mapNameToCenter.set(name, { lat: lat, lng: lng });  // ready to feed to Leafleft map.panTo()
	}
}


async function getIntersections(name) {
	//const file = './data/intersections.geojson';
	//const file = './data/intersections_berkeley.geojson';
	//const file = './data/intersections_oakland.geojson';
	const file = './data/intersections/intersections_' + name + '.json';
	const interJson = await getJson(file);
	return interJson;
}

// Berkeley
const LatitudeDefault = 37.87;
const LongitudeDefault = -122.27;

var intersections = await getIntersections('Alameda_County');

var map;

const overlays = [];
var layerControl;

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

	//layerControl = L.control.layers(null, overlays, { collapsed: true, position: 'topright' }).addTo(map);

}

createMap();

const arrCounties = [];
const arrCountyCityKeys = [];

const UNINCORPORATED = 'Unincorporated';

for (const obj of countyCityJSON) {
	arrCounties.push(obj.countyName);
}

populateSelect(arrCounties, selectCounty);







/*
// add city boundary to map
//L.geoJSON(cityGeoJson, { fillOpacity: 0.05 }).addTo(map);
const cityNames = new Set();
const mapCityToLayerGroup = new Map();

function stdizeCityName(name) {
	return name.toLowerCase().trim().replaceAll(' ', '');
}
for (const boundaryFeature of countyBoundariesGeoJson.features) {
	const prop = boundaryFeature.properties;
	const name = prop.name;



	if (prop.boundary == 'administrative') {
		console.log("level ", prop.admin_level, name);
		if (8 == prop.admin_level || 6 == prop.admin_level) { // cities and county only	
			var markerLayer = L.layerGroup();
			mapCityToLayerGroup.set(stdizeCityName(name), markerLayer);

			//layerControl.addOverlay( markerLayer, name);


			L.geoJSON(boundaryFeature, { fillOpacity: 0.05 }).bindPopup(name).addTo(markerLayer);
			cityNames.add(name);
		}
	}
}



const markerCities = Array.from(mapCityToLayerGroup.keys()).sort();
for (const name of markerCities) {
	if (name.includes('county') || name.includes('francisco')) {
		layerControl.addOverlay(mapCityToLayerGroup.get(name), name);
	}
}*/

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
	markers.length = 0; // let the markers be gc'd
}

function addMarkers(intersections) {
	//removeAllMakers();
	//const markersAtLocation = new Map();
	// add collisions to map
	var markerCount = 0
	//var skipped = 0, plotted = 0;

	const primaryRoadPattern = primaryRoad.value;
	const secondaryRoadPattern = secondaryRoad.value;

	const filtering = (primaryRoadPattern || secondaryRoadPattern);

	for (const intersection of intersections) {

		const loc = intersection.geometry.coordinates;
		const lat = loc[1];
		const long = loc[0];

		const opt = getMarkerOpt();

		const marker = L.circleMarker([lat, long], opt

		);

		const streetMsg = intersection.properties.streets.join(slash);
		const msg = streetMsg + "<br/>nodeId:"+ intersection.properties.nodeId;

		if (pointerFine) {

			//marker.bindTooltip(msg).openTooltip();
			marker.bindPopup(msg).openPopup();
		} else {
			marker.bindPopup(msg).openPopup();
		}

		if (filtering) {
			if (primaryRoadPattern && !streetMsg.includes(primaryRoadPattern)) {
				continue;
			}
			if (secondaryRoadPattern && !streetMsg.includes(secondaryRoadPattern)) {
				continue;
			}
		} 
		marker.addTo(map)
		
		markers.push(marker);
		markerCount++;

	}
	console.log("markerCount ", markerCount)
}

async function loadIntersectionsForCount( county) {

	intersections = await getIntersections( fileNameIze(county))

}
/* when county select changes, populate the city */
async function handleSelectCountyChange(event) {
	console.log("Select county changed to ", selectCounty.value);
	const county = selectCounty.value;

	if (map) {
		const center = mapNameToCenter.get(county);
		if (center) {
			map.panTo(center);
		}
	}

	removeAllMakers();
	await loadIntersectionsForCount(county);

	addMarkers(intersections.features);

}
selectCounty.addEventListener('change', (event) => {
	handleSelectCountyChange(event);
});


await handleSelectCountyChange(null);


async function handleFilterClick() {
	

	removeAllMakers();
	

	addMarkers(intersections.features);

	
	


}

document.querySelector('#filterButton').addEventListener('click', (event) => {
	handleFilterClick();

});



//addMarkers(interJson.features);
/*
const mapCityToJson = new Map();

for (const name of cityNames) {
	const intersectionsGeoJson = await getIntersections(stdizeCityName(name));
	if (intersectionsGeoJson) {
		console.log("name", name, intersectionsGeoJson.features.length)
		const lg = mapCityToLayerGroup.get(stdizeCityName(name))
		mapCityToJson.set(stdizeCityName(name), intersectionsGeoJson);

		addMarkers(intersectionsGeoJson.features, lg);
	} else {
		console.log("no intersections found for ", name)
	}
}

mapCityToLayerGroup.get("Alameda County").addTo(map);*/

/* BEGIN UNINCORPORATED
const countyJson = mapCityToJson.get("alamedacounty");
const cityJsons = [];
for (const k of mapCityToJson.keys()) {
	if (!k.includes("county")) {
		cityJsons.push(mapCityToJson.get(k));
	}
}






// set of strings of lon, lat
const cityCoords = new Set();

for (const json of cityJsons) {
	for (const f of json.features) {
		const coords = f.geometry.coordinates;
		cityCoords.add(''+coords);
	}
}


// compute the Unincorporated areas intersections by removing the city intersections from the county intersections
function subtract(county, cityCoords) {
	const newFeatures = county.features.filter( f => (!cityCoords.has(''+f.geometry.coordinates)));
	const retval = {features: newFeatures};
	return retval

}

const unincorporatedJson = subtract( countyJson, cityCoords);
const unName = 'Unincorporated'

var markerLayer = L.layerGroup();
addMarkers(unincorporatedJson.features, markerLayer);
layerControl.addOverlay( markerLayer, unName);








END UNINCORPORSATED
*/

export {
	map
};