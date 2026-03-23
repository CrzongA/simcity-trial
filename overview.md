# City In Time - Project Overview

## 1. Project Description
City In Time is a web-based application that allows users to explore and simulate the future of cities under different scenarios. It provides a timeline-based interface and 3D visualization to view historical events, population data, sea-level rise, and other relevant information for each city.
This project currently only uses Portsmouth, UK as the test city.

## 2. Key Features
- **Timeline Interface**: Users can navigate through time using a timeline slider
- **3D Visualization**: Users can view the city in 3D
- **City Data**: View historical events, population data, and other relevant information for each city
- **Responsive Design**: The application is designed to work on different devices

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
2. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```
3. Start the application:
   ```bash
   cd frontend
   npm run dev
   ```

## 6. License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.