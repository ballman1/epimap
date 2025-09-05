// Complete EpiPen Community Map App with Auto Medical Facility Detection

const firebaseConfig = {
  apiKey: "AIzaSyAEqp-BO5SGdoKEB154FfgVsRP0cdaxpAU",
  authDomain: "epipen-finder-map-34982.firebaseapp.com",
  projectId: "epipen-finder-map-34982",
  storageBucket: "epipen-finder-map-34982.firebasestorage.app",
  messagingSenderId: "389714610819",
  appId: "1:389714610819:web:a1a6310b98039d9ab2e9b6",
  measurementId: "G-KZ5PPMNKEQ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

auth.signInAnonymously().catch(console.error);

// Embedded EpiPen icon as SVG data URL (32x32)
const iconDefault = "data:image/svg+xml;base64," + btoa(`
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="12" width="20" height="8" rx="4" fill="#ff9800" stroke="#333" stroke-width="1"/>
  <rect x="8" y="14" width="16" height="4" rx="2" fill="#ffb74d"/>
  <text x="16" y="18" text-anchor="middle" fill="#fff" font-size="8" font-family="Arial">EPI</text>
  <circle cx="24" cy="16" r="2" fill="#f57c00"/>
</svg>
`);

// Verified icon (green version)
const iconVerified = "data:image/svg+xml;base64," + btoa(`
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="12" width="20" height="8" rx="4" fill="#4caf50" stroke="#333" stroke-width="1"/>
  <rect x="8" y="14" width="16" height="4" rx="2" fill="#8bc34a"/>
  <text x="16" y="18" text-anchor="middle" fill="#fff" font-size="8" font-family="Arial">EPI</text>
  <circle cx="24" cy="16" r="2" fill="#2e7d32"/>
  <path d="M22 14 l2 2 l4-4" stroke="#fff" stroke-width="1.5" fill="none"/>
</svg>
`);

// Medical facility icon (red cross)
const iconMedical = "data:image/svg+xml;base64," + btoa(`
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="14" fill="#fff" stroke="#dc143c" stroke-width="2"/>
  <rect x="14" y="6" width="4" height="20" fill="#dc143c"/>
  <rect x="6" y="14" width="20" height="4" fill="#dc143c"/>
</svg>
`);

// Helper function to create markers with full functionality
function createMarker(map, data, docId, likes = 0, flags = 0) {
  let icon = iconDefault;
  if (data.isMedicalFacility) {
    icon = iconMedical;
  } else if (data.verifiedByBusiness) {
    icon = iconVerified;
  }

  const marker = new google.maps.Marker({
    position: { lat: data.lat, lng: data.lng },
    map,
    title: data.name,
    icon: {
      url: icon,
      scaledSize: new google.maps.Size(32, 32)
    }
  });

  const infoWindow = new google.maps.InfoWindow({
    content: `
      <div style="max-width: 300px;">
        <strong>${data.name}</strong><br>
        ${data.address}<br>
        Type: ${data.type}<br>
        ${data.isMedicalFacility ? "<span style='color:red'>🏥 Medical Facility - EpiPen Available</span><br>" : ""}
        ${data.verifiedByBusiness && !data.isMedicalFacility ? "<span style='color:green'>✅ Verified by the business</span><br>" : ""}
        <button onclick="submitFeedback('${docId}', 'like')">👍 Confirm</button>
        <button onclick="submitFeedback('${docId}', 'flag')">🚩 Flag</button><br>
        👍 ${likes} | 🚩 ${flags}<br><br>
        ${!data.verifiedByBusiness && !data.isMedicalFacility ? `<a href='mailto:verify@epipenmap.org?subject=Verify My EpiPen Location&body=Name: ${encodeURIComponent(data.name)}%0D%0AAddress: ${encodeURIComponent(data.address)}'>Request to Verify</a>` : ""}
      </div>
    `
  });

  marker.addListener("click", () => infoWindow.open(map, marker));
  return marker;
}

// Function to search and add medical facilities
async function searchAndAddMedicalFacilities(map, center, radius = 10000) {
  const service = new google.maps.places.PlacesService(map);
  
  // Search terms for medical facilities that typically have epinephrine
  const medicalTypes = [
    { type: 'hospital', keyword: 'emergency room' },
    { type: 'hospital', keyword: 'emergency department' },
    { type: 'doctor', keyword: 'urgent care' },
    { type: 'doctor', keyword: 'walk in clinic' },
    { type: 'health', keyword: 'emergency medical' }
  ];

  const processedPlaces = new Set(); // To avoid duplicates

  for (const searchTerm of medicalTypes) {
    const request = {
      location: center,
      radius: radius,
      type: [searchTerm.type],
      keyword: searchTerm.keyword
    };

    try {
      const results = await new Promise((resolve, reject) => {
        service.nearbySearch(request, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK) {
            resolve(results);
          } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            resolve([]);
          } else {
            reject(new Error(`Places search failed: ${status}`));
          }
        });
      });

      for (const place of results) {
        // Skip if we've already processed this place
        if (processedPlaces.has(place.place_id)) continue;
        processedPlaces.add(place.place_id);

        // Check if this medical facility already exists in our database
        const existingQuery = await db.collection("locations")
          .where("placeId", "==", place.place_id)
          .get();

        if (existingQuery.empty) {
          // Add new medical facility to database
          const locationData = {
            name: place.name,
            type: "medical-facility",
            address: place.vicinity || place.formatted_address || "Address not available",
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            placeId: place.place_id,
            submittedAt: new Date(),
            verifiedByBusiness: true, // Medical facilities are auto-verified
            isMedicalFacility: true,
            autoDetected: true
          };

          try {
            const docRef = await db.collection("locations").add(locationData);
            createMarker(map, locationData, docRef.id, 0, 0);
            console.log(`Added medical facility: ${place.name}`);
          } catch (error) {
            console.error(`Error adding medical facility ${place.name}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Error searching for ${searchTerm.keyword}:`, error);
    }
  }
}

// Function to scan for medical facilities in the current viewport
async function scanCurrentArea(map) {
  const bounds = map.getBounds();
  if (!bounds) return;
  
  const center = bounds.getCenter();
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  
  // Calculate approximate radius from viewport
  const lat1 = center.lat();
  const lng1 = center.lng();
  const lat2 = ne.lat();
  const lng2 = ne.lng();
  
  // Simple distance calculation (not perfectly accurate but good enough)
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const radius = Math.min(R * c, 50000); // Cap at 50km
  
  await searchAndAddMedicalFacilities(map, center, radius);
}

window.initMap = async function () {
  // Default center (USA)
  let mapCenter = { lat: 39.8283, lng: -98.5795 };
  let zoomLevel = 5;

  // Try to get user's geolocation
  if (navigator.geolocation) {
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
      });
      mapCenter = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      zoomLevel = 13;
    } catch (err) {
      // If user denies or error, fallback to default
      console.warn("Geolocation not available or denied, using default center.");
    }
  }

  const map = new google.maps.Map(document.getElementById("map"), {
    center: mapCenter,
    zoom: zoomLevel,
    gestureHandling: "greedy"
  });

  // Load existing markers from database
  const snapshot = await db.collection("locations").get();
  for (const doc of snapshot.docs) {
    const data = doc.data();

    const feedbackSnap = await db.collection("locations").doc(doc.id).collection("feedback").get();
    let likes = 0, flags = 0;
    feedbackSnap.forEach(f => {
      if (f.data().type === "like") likes++;
      if (f.data().type === "flag") flags++;
    });

    createMarker(map, data, doc.id, likes, flags);
  }

  // Automatically search for medical facilities in the initial view
  setTimeout(() => {
    scanCurrentArea(map);
  }, 1000);

  // Add button to manually trigger medical facility search
  const scanButton = document.createElement("button");
  scanButton.textContent = "🏥 Find Medical Facilities";
  scanButton.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    padding: 10px 15px;
    background: white;
    border: 2px solid #ccc;
    border-radius: 3px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    z-index: 5;
  `;
  scanButton.onclick = async () => {
    scanButton.disabled = true;
    scanButton.textContent = "Scanning...";
    await scanCurrentArea(map);
    scanButton.disabled = false;
    scanButton.textContent = "🏥 Find Medical Facilities";
    
    // Show success message
    const message = document.createElement("div");
    message.textContent = "✅ Medical facilities scan complete!";
    message.style.cssText = `
      position: fixed;
      top: 60px;
      right: 10px;
      padding: 10px 20px;
      background: #4caf50;
      color: white;
      border-radius: 6px;
      font-weight: bold;
      z-index: 9999;
      font-family: Arial, sans-serif;
    `;
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 3000);
  };
  
  // Add the button to the map
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(scanButton);

  // Optionally scan for medical facilities when map is idle (user stops moving/zooming)
  let idleTimer;
  map.addListener("idle", () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      // Only auto-scan if zoom level is sufficient (not too zoomed out)
      if (map.getZoom() >= 11) {
        scanCurrentArea(map);
      }
    }, 3000); // Wait 3 seconds after map stops moving
  });

  // Original click listener for manual tagging
  map.addListener("click", async function (event) {
    const clickedLatLng = event.latLng;
    const confirmTag = window.confirm("Tag this location as having an EpiPen?");
    if (!confirmTag) return;

    try {
      // Get address using geocoding
      const geocode = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${clickedLatLng.lat()},${clickedLatLng.lng()}&key=AIzaSyASHf6jmZTRP_zxWdSbaI205EMmlg-Q0Qc`);
      const data = await geocode.json();

      if (!data.results || data.results.length === 0) {
        alert("Could not identify this location.");
        return;
      }

      const result = data.results[0];
      
      // Simple name extraction - use first part of formatted address
      const addressParts = result.formatted_address.split(',');
      let locationName = addressParts[0].trim();
      
      // If it starts with a number, it's probably just an address, so ask for a name
      if (locationName.match(/^\d+/)) {
        const customName = prompt(`Enter a name for this location:\n(e.g., "CVS Pharmacy", "Community Center")`);
        if (customName && customName.trim()) {
          locationName = customName.trim();
        } else {
          locationName = locationName; // Use the address
        }
      }

      const locationData = {
        name: locationName,
        type: "community-tagged",
        address: result.formatted_address,
        lat: clickedLatLng.lat(),
        lng: clickedLatLng.lng(),
        submittedAt: new Date(),
        verifiedByBusiness: false,
        isMedicalFacility: false
      };

      const docRef = await db.collection("locations").add(locationData);
      createMarker(map, locationData, docRef.id, 0, 0);

      // Show success message
      const confirmation = document.createElement("div");
      confirmation.textContent = `✅ "${locationName}" tagged successfully!`;
      confirmation.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 20px;
        background: #4caf50;
        color: white;
        border-radius: 6px;
        font-weight: bold;
        z-index: 9999;
        font-family: Arial, sans-serif;
      `;
      document.body.appendChild(confirmation);
      setTimeout(() => confirmation.remove(), 3000);

    } catch (error) {
      console.error("Error tagging location:", error);
      alert("Error tagging location. Please try again.");
    }
  });
};

window.submitFeedback = function (locationId, type) {
  db.collection("locations").doc(locationId).collection("feedback").add({
    type,
    submittedAt: new Date()
  }).then(() => {
    alert(type === "like" ? "Thanks for confirming!" : "Flag received. We'll review it.");
  }).catch(error => {
    console.error("Error submitting feedback:", error);
    alert("Error submitting feedback.");
  });
};
