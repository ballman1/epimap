// Complete EpiPen Community Map App with Full Functionality

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
const iconDefault = "epipen_icon_transparent_32x32.png";

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

// Helper function to create markers with full functionality
function createMarker(map, data, docId, likes = 0, flags = 0) {
  const marker = new google.maps.Marker({
    position: { lat: data.lat, lng: data.lng },
    map,
    title: data.name,
    icon: {
      url: data.verifiedByBusiness ? iconVerified : iconDefault,
      scaledSize: new google.maps.Size(32, 32)
    }
  });

  const infoWindow = new google.maps.InfoWindow({
    content: `
      <div style="max-width: 300px;">
        <strong>${data.name}</strong><br>
        ${data.address}<br>
        Type: ${data.type}<br>
        ${data.verifiedByBusiness ? "<span style='color:green'>✅ Verified by the business</span><br>" : ""}
        <button onclick="submitFeedback('${docId}', 'like')">👍 Confirm</button>
        <button onclick="submitFeedback('${docId}', 'flag')">🚩 Flag</button><br>
        👍 ${likes} | 🚩 ${flags}<br><br>
        ${!data.verifiedByBusiness ? `<a href='mailto:verify@epipenmap.org?subject=Verify My EpiPen Location&body=Name: ${encodeURIComponent(data.name)}%0D%0AAddress: ${encodeURIComponent(data.address)}'>Request to Verify</a>` : ""}
      </div>
    `
  });

  marker.addListener("click", () => infoWindow.open(map, marker));
  return marker;
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
        verifiedByBusiness: false
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