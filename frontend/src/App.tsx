import { Box, Typography } from '@mui/material';
import CityMap from './components/CityMap';

function App() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <CityMap />
      </Box>
    </Box>
  );
}

export default App;
