import tj from "@mapbox/togeojson";
import { distance, lineIntersect, lineSlice, polygon } from "@turf/turf";
import fs from "fs";
import tokml from "tokml";
import { DOMParser } from "xmldom";
import prompt from "prompt-sync";
import papa from "papaparse";

const promptSync = prompt();

const polyName = promptSync("Original KML (polygon):"); // Prompt the user for the filename
const linesName = promptSync("Lines KML (lines):"); // Prompt the user for the filename
const keepExternalLines = promptSync("Keep external lines? (y/n):"); // Prompt the user for the filename

const linesKml = fs.readFileSync(`${linesName}`, "utf-8");
const polyKml = fs.readFileSync(`${polyName}`, "utf-8");
const linesGeoJson = tj.kml(new DOMParser().parseFromString(linesKml));
const polyGeoJson = tj.kml(new DOMParser().parseFromString(polyKml));

const lines = linesGeoJson.features.filter(
  (feature) => feature.geometry.type === "LineString"
);
const poly = polygon(polyGeoJson.features[0].geometry.coordinates);
const reprojectedLines = lines;
const reprojectedPoly = poly;

function trimLineToPolygon(line, poly) {
  // Find all intersection points between the line and the polygon
  const intersection = lineIntersect(line, poly);

  if (intersection.features.length >= 2) {
    // Find the pair of intersection points that forms the longest segment
    let maxLength = 0;
    let startIdx, endIdx;

    for (let i = 0; i < intersection.features.length - 1; i++) {
      for (let j = i + 1; j < intersection.features.length; j++) {
        const startPoint = intersection.features[i].geometry.coordinates;
        const endPoint = intersection.features[j].geometry.coordinates;
        const length = distance(startPoint, endPoint);

        if (length > maxLength) {
          maxLength = length;
          startIdx = i;
          endIdx = j;
        }
      }
    }

    // Create a trimmed line between the selected intersection points
    const startPoint = intersection.features[startIdx].geometry.coordinates;
    const endPoint = intersection.features[endIdx].geometry.coordinates;

    const trimmedLine = lineSlice(startPoint, endPoint, line);
    trimmedLine.geometry.coordinates = trimmedLine.geometry.coordinates.map(
      (coord) => {
        return coord.concat(line.geometry.coordinates[0][2]); // Append altitude from the original line
      }
    );
    return trimmedLine;
  }

  // If there are not enough intersection points, return null
  return keepExternalLines === "y" ? line : null;
}

const trimmedLines = reprojectedLines.map((line) =>
  trimLineToPolygon(line, reprojectedPoly)
);
const csvData = [
  [
    "Name",
    "Start latitude",
    "Start longitude",
    "Start altitude",
    "Stop latitude",
    "Stop longitude",
    "Stop altitude",
  ],
];

const trimmedFeatures = trimmedLines.filter(Boolean);

// Populate the CSV data with start and stop points of each trimmed line
trimmedFeatures.forEach((feature, index) => {
  const coordinates = feature.geometry.coordinates;

  // Assuming coordinates are in the format [longitude, latitude, altitude]
  const startLat = coordinates[0][1];
  const startAlt = coordinates[0][2];
  const startLong = coordinates[0][0];
  const stopAlt = coordinates[coordinates.length - 1][2];
  const stopLat = coordinates[coordinates.length - 1][1];
  const stopLong = coordinates[coordinates.length - 1][0];

  // Add a row to the CSV data array
  csvData.push([
    index + 1,
    startLat,
    startLong,
    startAlt.toFixed(0),
    stopLat,
    stopLong,
    stopAlt.toFixed(0),
  ]);
});

// Convert the CSV data to a CSV string
const csvString = papa.unparse(csvData, { delimiter: ";" });

// Save the CSV string to a new file
fs.writeFileSync(`./${polyName}_trimmed.csv`, csvString, "utf8");

// const trimmedGeoJSON = {
//   type: "FeatureCollection",
//   features: trimmedLines.filter(Boolean),
// };

// // Convert the GeoJSON to KML
// const trimmedKML = tokml(trimmedGeoJSON);

// // Save the trimmed KML to a new file
// fs.writeFileSync(`./${polyName}_trimmed.kml`, trimmedKML, "utf8");
