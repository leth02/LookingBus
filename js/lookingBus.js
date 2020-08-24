// Function to get transit operators
const API_KEY = '2e031256-3f0f-48d9-990b-b4df21285a7b';
const backup_KEY = 'ce1be608-3887-45ce-a1dd-ee79e561d8eb';
let currentBusOperator = "";
let updateVar;

// Create HTML select element with callback to changeOperator function
function generateSelect(operators) {
  let txt = "";
  txt += '<select class="custom-select" id="mySelect" onchange="changeOperator(this.value)">';
  txt += '<option value="">Choose...</option>';
  for (obj of operators) {
    txt += `<option value=${obj.Id}>${obj.Name}</option>`;
  }
  txt += "</select>"

  document.getElementById("operatorSelect").innerHTML = txt;
}

// API call to get the list of operators at SF Bay
async function getOperators() {
  const response = await fetch(`http://api.511.org/transit/operators?api_key=${API_KEY}&format=json`)
  return response.json()
}

// get the bus list from the selected operator
async function getBus(operatorId) {
  const response = await fetch(`http://api.511.org/transit/VehicleMonitoring?api_key=${API_KEY}&agency=${operatorId}&format=json`)
  return response.json()
}

// Create the table for the bus list
function changeOperator(operatorId) {
  
  currentBusOperator = operatorId;

  if (operatorId == "") {
    console.log("Please select a bus operator");
  }
  else {
    getBus(operatorId)
    .then(data => {
      // VehicleActivity is a list of recorded bus.
      // It could be undefined if no records of bus from the chosen operator are returned
      let busInfo = data.Siri.ServiceDelivery.VehicleMonitoringDelivery.VehicleActivity;
      
      if (busInfo !== undefined) {
        // add bus records (aka. table body)
        let busList = [];
        for (let i = 0; i < busInfo.length; i++) {
          
          // Only choose buses that are really running at the moment
          if (busInfo[i].MonitoredVehicleJourney.MonitoredCall) {
            
            let busId = busInfo[i].MonitoredVehicleJourney.VehicleRef;
            let busLongitude = busInfo[i].MonitoredVehicleJourney.VehicleLocation.Longitude;
            let busLatitude = busInfo[i].MonitoredVehicleJourney.VehicleLocation.Latitude;
            let nextStop = busInfo[i].MonitoredVehicleJourney.MonitoredCall.StopPointName;
            let busLine = busInfo[i].MonitoredVehicleJourney.PublishedLineName;
            //let busOrigin = busInfo[i].MonitoredVehicleJourney.OriginName;
            //let busDestination = busInfo[i].MonitoredVehicleJourney.DestinationName;
            let unixETA = Date.parse(busInfo[i].MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime);
            let fETA = new Date(unixETA);
            // Calculate late time
            let unixATA = Date.parse(busInfo[i].MonitoredVehicleJourney.MonitoredCall.AimedArrivalTime);
            let lateTime = parseInt((unixETA - unixATA) / 1000);
            
            let lateMinutes, lateSeconds;
            if (lateTime >= 60) {
              lateMinutes = parseInt(lateTime / 60);
              lateSeconds = lateTime - lateMinutes*60;
            }
            else if (lateTime >=0) {
              lateMinutes = 0, lateSeconds = lateTime;
            }
            else {
              lateMinutes = lateSeconds = 0;
            }

            let ETAString = "";
            ETAString += (fETA.getHours() < 10 ? "0" + fETA.getHours() : fETA.getHours()) + ":";
            ETAString += (fETA.getMinutes() < 10 ? "0" + fETA.getMinutes() : fETA.getMinutes()) + ":";
            ETAString += (fETA.getSeconds() < 10 ? "0" + fETA.getSeconds() : fETA.getSeconds());

            let progressStatus = "";
            if (lateMinutes === 0  && lateSeconds === 0) {
              progressStatus = "On time"
            }
            else {
              if (lateMinutes < 10) {
                progressStatus += "0" + lateMinutes;
              } else {
                progressStatus += "" + lateMinutes;
              }
              progressStatus += ":";

              if (lateSeconds < 10) {
                progressStatus += "0" + lateSeconds;
              } else {
                progressStatus += "" + lateSeconds;
              }
            }

            // Exclude bus records that have VehicleRef/VehicleLocation of null
            if (busId !== null || busLongitude !== "" || busLatitude !== "") {
              busList.push([
                busId,
                busLongitude + " - " + busLatitude,
                ETAString,
                progressStatus,
                nextStop,
                busLine
                // busOrigin,
                // busDestination
              ])
            }
          }
        }
        
        // Draw the markers
        drawMarkers(busList);
        // Redraw the DataTable of the bus list to include new bus list.
        var myDataTable = $("#dataTable").DataTable();
        myDataTable.clear();
        myDataTable.rows.add(busList).draw();

      }
      else {
        //document.getElementById("tableBody").innerHTML = "";
        alert(`There are no running buses from the selected operator (${Id}). Please choose another operator.`);
      }
    })
  }
}

// Initialize Google Map, latlngbounds and a list of Google Marker objects
let map;
let bounds;
let markers = [];

let globalBusCode = "";
let globalBusLocation = null;
let globalBusETA = "";
let globalBusProgress = "";
let globalBusNextStop = "";
let globalBusLine = "";

let infoWindow ;

function initMap() {
  
  map = new google.maps.Map(document.getElementById("googleMap"), {
    center: {lat: 37.701081, lng: -122.310717},
    zoom: 10,
    gestureHandling: 'greedy' 
  });
}


function updateInfoWindow(map, marker, busCode, busETA, busProgress, busNextStop, busLine) {
  let contentString = 
    '<div style="background-color:#a3f772 ; color: #2f303d; padding-bottom:10px">' +
    `<h5 style="text-align:center" > Bus Code: ${busCode} </h5>` +
    '<div style="font-size:16px" >' +
    `<p> <b>Next Stop</b>: ${busNextStop}</p>` +
    `<p> <b>ETA</b>: ${busETA} </p>` +
    `<p> <b>Progress</b>: ${busProgress}</p>` +
    `<p> <b>Route name</b>: ${busLine} </p>` +
    "</div>" +
    "</div>";
  
  if (infoWindow) {infoWindow.close();}

  infoWindow = new google.maps.InfoWindow({
    content:contentString,
    maxWidth: 330
  });

  console.log("open infowindow");
  infoWindow.open(map, marker);
}

function drawMarkers(busList) {
  // reset the bound view
  if (bounds != null) {
    bounds = null
  }
  deleteMarkers();

  bounds = new google.maps.LatLngBounds();

  // Generate new Google markers
  let selectedBusAvailable = false;

  for (bus of busList) {
    let coordinates = bus[1].split(" - ");
    
    if (bus[0] == globalBusCode) {
      console.log("Prev bus selected still there");
      selectedBusAvailable = true;
      updateGlobalBusLocation({lat: parseFloat(coordinates[1]), lng: parseFloat(coordinates[0])});

    }

    // Info window for the marker
    // let contentString = 
    //   '<div style="background-color:#a3f772 ; color: #2f303d; padding-bottom:10px">' +
    //   `<h5 style="text-align:center" > Bus Code: ${bus[0]} </h5>` +
    //   '<div style="font-size:16px" >' +
    //   `<p> <b>Next Stop</b>: ${bus[4]}</p>` +
    //   `<p> <b>ETA</b>: ${bus[2]} </p>` +
    //   `<p> <b>Progress</b>: ${bus[3]}</p>` +
    //   `<p> <b>Route name</b>: ${bus[5]} </p>` +
    //   "</div>" +
    //   "</div>";

    // infoWindow = new google.maps.InfoWindow({
    //   content: contentString,
    //   maxWidth: 330
    // });

    //
    // If the current global bus is not the updated array of buses, then clear the globalBusCode
    // Pan the map to the original (updated) bounds of all current markers
    // Otherwise maintain the view on the current selected bus.
    //

    // Create the marker
    let marker = new google.maps.Marker({
      position: {lat: parseFloat(coordinates[1]), lng: parseFloat(coordinates[0])},
      icon: "https://img.icons8.com/dusk/32/000000/bus.png",
      //map: map
    });
    
    // Show the Information of the clicked bus and zoom
    let busCode = bus[0];
    let busETA = bus[2];
    let busProgress = bus[3];
    let busNextStop = bus[4];
    let busLine = bus[5];

    marker.addListener("click", () => {
      console.log("marker or table row is clicked");
      //infoWindow.open(map, marker);
      updateInfoWindow(map, marker, busCode, busETA, busProgress, busNextStop, busLine);


      map.setZoom(18); // street view
      map.setCenter(marker.getPosition());

      // Update globalBus params for future update
      updateGlobalBusCode(busCode);
      updateGlobalBusLocation({lat: parseFloat(coordinates[1]), lng: parseFloat(coordinates[0])});
      updateGlobalBusETA(busETA);
      updateglobalBusProgress(busProgress);
      updateGlobalBusNextStop(busNextStop);
      updateGlobalBusLine(busLine);

    })

    bounds.extend({lat: parseFloat(coordinates[1]), lng: parseFloat(coordinates[0])});
    //markers.push(marker); // Change from storing an array of markers to storing an array of (marker, busCode)
    markers.push([marker, busCode]) 
  }
  
  showMarkers();

  if (selectedBusAvailable) {
    map.setCenter(globalBusLocation);
    console.log("Pan the map to the current bus");


  } else {
    changeViewport();
  }

  console.log("*** Initial global bus code: ", globalBusCode, " ***");
  
}

// making use of closure and let
function updateGlobalBusCode(busCode) {
  globalBusCode = busCode;
  console.log("Global Bus Code updated", globalBusCode);
}

// Update global bus location
function updateGlobalBusLocation(locationObj) {
  globalBusLocation = locationObj;
  console.log("Global Bus Location updated", globalBusLocation);
}

function updateGlobalBusETA (x) {
  globalBusETA = x; 
}
function updateglobalBusProgress (x) {
  globalBusProgress = x;
}
function updateGlobalBusNextStop (x) {
  globalBusNextStop = x; 
}
function updateGlobalBusLine (x) {
  globalBusLine = x;
}


function changeViewport() {
  map.fitBounds(bounds);
  map.panToBounds(bounds);
}

// Sets the map on all markers in the array.
function setMapOnAll(map) {
  for (let i = 0; i < markers.length; i++) {
    markers[i][0].setMap(map);
    if (markers[i][1] == globalBusCode) {
      console.log("DCM");
      updateInfoWindow(map, markers[i][0], globalBusCode, globalBusETA, globalBusProgress, globalBusNextStop, globalBusLine);
    }
    
  }
}

// Removes the markers from the map, but keeps them in the array.
function clearMarkers() {
  setMapOnAll(null);
}

// Shows any markers currently in the array.
function showMarkers() {
  setMapOnAll(map);
}

// Deletes all markers in the array by removing references to them.
function deleteMarkers() {
  clearMarkers();
  markers = [];
}

// Update the bus table and markers every 1 minute
function updateBusInfo() {
  updateVar = setInterval(() => {
    changeOperator(currentBusOperator);
    //drawMarkers();
  }, 10000);
}

//////////////////////////////////////////////////

// Start of the application
getOperators()
.then(data => {
  
  // GENERATE ONLY BUS OPERATORS 
  let operators = []
  let temp = data.forEach(element => {
    if (element.PrimaryMode == "bus") {
      operators.push({"Id": element.Id, "Name": element.Name})
    }
  });

  return operators;
})
.then(operators => generateSelect(operators))

updateBusInfo();

///////////////////////////////////////////////////////

// Onclick callback for rows in bus list table. Might be usefull later.
function myCall(busData) {
  let coordinates = busData[1].split(" - ");
  updateGlobalBusCode(busData[0]);
  updateGlobalBusLocation({lat: parseFloat(coordinates[1]), lng: parseFloat(coordinates[0])});

  console.log("TABLE CLICKED, Bus Code is ", busData[0]);
  for (marker of markers) {
    if (marker[1] == busData[0]) {
      console.log("SEEEE ITTTT", marker[1]);
      new google.maps.event.trigger(marker[0], 'click');
      
    }
  }
}



