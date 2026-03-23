import { Box, Typography } from '@mui/material';
import CityMap from './components/CityMap';

function App() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <CityMap />
      </Box>
      <Box sx={{ p: 2, height: '100px', backgroundColor: 'background.paper', borderTop: 1, borderColor: 'divider', zIndex: 10, position: 'relative' }}>
        <Typography variant="h6" color="primary">Timeline Interface</Typography>
      </Box>
    </Box>
  );
}

export default App;
