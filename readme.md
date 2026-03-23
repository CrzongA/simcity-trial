# City In Time - Project Overview

## 1. Project Description
City In Time is a web-based application that allows users to explore and simulate the future of cities under different scenarios. It provides a timeline-based interface and 3D visualization to view historical events, population data, sea-level rise, and other relevant information for each city.
This project currently only uses Portsmouth, UK as the test city.

## 2. Key Features
- **Photorealistic 3D Map**: Uses **Google Photorealistic 3D Tiles** precisely clipped to the Portsea Island boundary.
- **Topographic Terrain**: Integrates **Cesium World Terrain** for accurate elevation tracking across the city.
- **Dark Matter Base**: Employs **CartoDB Dark Matter** for a sleek, high-contrast imagery base layer beneath the photorealistic meshes.
- **Timeline Interface**: Users can navigate through time using a timeline slider.
- **City Data**: View historical events, population data, and other relevant information for the city.
- **Responsive Design**: The application is designed to work on different devices.

## 3. Technology Stack
- **Frontend**: Vite (React), React Router, Redux, Material-UI, Three.js, Resium (Cesium.js)

## 4. Project Structure
```
CityInTime/
├── frontend/           # Frontend application
├── docker/             # Docker configuration
└── docs/               # Project documentation
```

## 5. Getting Started

### Prerequisites
- Node.js (v20 or higher)
- Docker (optional)

### Installation
1. Clone the repository
2. Set up your environment variables:
   - Create a copy of `.env.template` in the `frontend/` directory named `.env`.
   - Add your Cesium Ion Token and Google Maps API Key to unlock the Photorealistic Tiles and World Terrain.
3. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```
4. Start the application:
   ```bash
   cd frontend
   npm run dev
   ```

## 6. License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.