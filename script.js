const SUPABASE_URL = 'https://dsomoriuoapjqjdqvkrd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzb21vcml1b2FwanFqZHF2a3JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczMDMxNjYsImV4cCI6MjA3Mjg3OTE2Nn0.OiT4lg5BYeJgODwc8Z7lBaMDeCH916Yd8yUSHtEnqGg';

const { createClient } = supabase;
const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------- USER AUTH ----------------
const token = localStorage.getItem("authToken");
if (!token) {
  alert("Please login first!");
  window.location.href = "/login";
}

const decoded = jwt_decode(token);
const userEmail = decoded.email;
console.log("Logged in as:", userEmail);

const isAdmin = userEmail.includes("admin.civic");

// Track admin view mode
let showAllReports = false;

// ---------------- MAP SETUP ----------------
const map = L.map('mapContainer').setView([28.6139, 77.2090], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const markers = L.layerGroup().addTo(map);
const heat = L.heatLayer([], { radius: 25, blur: 15 }).addTo(map);

// SLA (Service Level Agreement) days
const SLA_DAYS = 7;

// ---------------- LOAD REPORTS ----------------
async function loadReports() {
  markers.clearLayers();
  const tableBody = document.getElementById("reportTableBody");
  tableBody.innerHTML = "";

  try {
    let query = supa.from('reports').select('*').order('reported_on', { ascending: false }).limit(2000);

    // For normal user → only their reports
    // For admin → conditionally show all or only their reports
    if (!isAdmin || !showAllReports) {
      query = query.eq('user_email', userEmail);
    }

    const { data, error } = await query;
    if (error) throw error;

    const points = [];

    data.forEach(r => {
      if (r.lat && r.lon) {
        const reportedDate = new Date(r.reported_on);
        const now = new Date();
        const daysPassed = Math.floor((now - reportedDate) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.max(0, SLA_DAYS - daysPassed);

        const popup = `
          <b>${r.report_type}</b><br>
          ${r.description || ''}<br>
          <b>Status:</b> ${r.status || 'open'}<br>
          <b>Days Remaining:</b> ${daysRemaining}<br>
          <small>Reported: ${reportedDate.toLocaleString()}</small><br>
          <small><b>User:</b> ${r.user_email || "N/A"}</small>
        `;

        L.marker([r.lat, r.lon]).bindPopup(popup).addTo(markers);
        points.push([parseFloat(r.lat), parseFloat(r.lon), 1]);

        const row = `
          <tr>
            <td>${r.report_type}</td>
            <td>${r.description || ""}</td>
            <td>${r.status || "open"}</td>
            <td>${r.ward || ""}</td>
            <td>${reportedDate.toLocaleString()}</td>
            <td>${daysRemaining}</td>
            ${isAdmin ? `<td>${r.user_email || ""}</td>` : ""}
          </tr>
        `;
        tableBody.innerHTML += row;
      }
    });

    heat.setLatLngs(points);

  } catch (e) {
    alert('Error loading reports: ' + (e.message || e));
  }
}

// ---------------- MAP CLICK ----------------
map.on('click', e => {
  document.getElementById('lat').value = e.latlng.lat.toFixed(6);
  document.getElementById('lon').value = e.latlng.lng.toFixed(6);
});

// ---------------- SUBMIT REPORT ----------------
document.getElementById('submitBtn').addEventListener('click', async () => {
  const payload = {
    report_type: document.getElementById('report_type').value,
    description: document.getElementById('description').value,
    ward: document.getElementById('ward').value,
    lat: parseFloat(document.getElementById('lat').value),
    lon: parseFloat(document.getElementById('lon').value),
    user_email: userEmail
  };

  if (!payload.lat || !payload.lon) { 
    alert('Click on map or enter Lat/Lon!');
    return; 
  }

  const { error } = await supa.from('reports').insert([payload]);
  if (error) { 
    alert('Insert failed: ' + error.message); 
    return; 
  }

  alert('Report submitted!');
  loadReports();
});

// ---------------- RELOAD BUTTON ----------------
document.getElementById('reloadBtn').addEventListener('click', loadReports);

// ---------------- ADMIN TOGGLE ----------------
if (isAdmin) {
  document.getElementById('adminControls').style.display = "block";
  document.getElementById('toggleViewBtn').addEventListener('click', () => {
    showAllReports = !showAllReports;
    document.getElementById('toggleViewBtn').innerText = showAllReports ? "Show My Reports" : "Show All Reports";
    loadReports();
  });
}

// ---------------- SEARCH ----------------
async function goToLocation() {
  const city = document.getElementById('city').value;
  const locality = document.getElementById('locality').value;
  if (!city && !locality) { 
    alert('Enter city or locality'); 
    return; 
  }

  const query = encodeURIComponent(`${locality}, ${city}`);
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data && data.length > 0) {
      const { lat, lon } = data[0];
      map.setView([parseFloat(lat), parseFloat(lon)], 14);
    } else {
      alert('Location not found!');
    }
  } catch (e) { 
    alert('Geocoding error: ' + e.message); 
  }
}

// ---------------- INITIAL LOAD ----------------
loadReports();
