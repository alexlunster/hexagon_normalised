# Demand-Supply Analyzer

A powerful geospatial visualization tool for analyzing demand and supply patterns using hexagonal aggregation. Built with React, TypeScript, and Deck.gl.

## Features

### 📊 Data Analysis
- **Upload Excel/CSV files** with demand and supply data
- **Real-time processing** of geospatial events
- **Hexagonal aggregation** using H3 geospatial indexing
- **Smart display logic**:
  - Shows **coefficient** (demand/supply ratio) when both files are uploaded
  - Shows **sum of events** when only demand file is uploaded

### 🗺️ Visualization
- **Interactive hexagon map** with Deck.gl
- **Bright, light basemap** for clear visibility
- **Dynamic zoom and pan** controls
- **Real-time label updates** as you explore
- **Responsive design** that works on all screen sizes

### 🎛️ Controls
- **Hexagon Resolution** slider (H3 levels 5-12)
- **Timeframe Window** selector (15 min - 24 hours)
- **Snapshot Time** controls (date and time sliders)
- **Delete buttons** for easy data management

## Tech Stack

- **Frontend**: React 19, TypeScript, TailwindCSS
- **Visualization**: Deck.gl, H3-js, MapLibre GL
- **Backend**: Express.js, tRPC
- **Build Tools**: Vite, esbuild
- **Package Manager**: pnpm

## Installation

### Prerequisites
- Node.js 22.x or higher
- pnpm 10.x or higher

### Local Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# The app will be available at http://localhost:3000
```

### Build for Production

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

## Project Structure

```
demand_supply_analyzer/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   └── main.tsx       # Entry point
│   └── index.html         # HTML template
├── server/                # Backend Express server
│   ├── _core/            # Server core logic
│   ├── routers/          # tRPC routers
│   └── middleware/       # Express middleware
├── shared/               # Shared types and utilities
├── dist/                 # Production build output
├── package.json          # Project dependencies
└── vercel.json          # Vercel deployment config
```

## Data Format

### Demand Data (Excel/CSV)
Required columns:
- `timestamp` - Date/time of demand event
- `latitude` - Latitude coordinate
- `longitude` - Longitude coordinate

Example:
```
timestamp,latitude,longitude
2025-12-01 10:30,48.1351,11.5820
2025-12-01 10:35,48.1355,11.5825
```

### Supply Data (Excel/CSV)
Required columns:
- `start_time` - Start time of availability
- `end_time` - End time of availability
- `latitude` - Latitude coordinate
- `longitude` - Longitude coordinate

Example:
```
start_time,end_time,latitude,longitude
2025-12-01 10:00,2025-12-01 12:00,48.1351,11.5820
2025-12-01 10:15,2025-12-01 14:30,48.1355,11.5825
```

## Deployment

### Vercel (Recommended)

See [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md) for detailed instructions.

Quick start:
1. Push code to GitHub
2. Connect repository to Vercel
3. Configure build settings (see guide)
4. Deploy!

### Docker

```bash
# Build Docker image
docker build -t demand-supply-analyzer .

# Run container
docker run -p 3000:3000 demand-supply-analyzer
```

### Environment Variables

Create a `.env` file for local development:

```
NODE_ENV=development
PORT=3000
```

For production (Vercel), set environment variables in the Vercel dashboard.

## Usage

1. **Upload Demand Data**: Click "Upload" in the Demand Data section
2. **Upload Supply Data** (Optional): Click "Upload" in the Supply Data section
3. **Adjust Settings**:
   - Change hexagon resolution for different detail levels
   - Adjust timeframe window to analyze different time periods
   - Use date/time sliders to explore specific moments
4. **Analyze Results**: View coefficients or event counts in hexagons
5. **Delete Data**: Click the trash icon to clear uploaded files

## Performance Tips

- Use hexagon resolution 8-9 for best performance with large datasets
- Limit timeframe window to reduce computation
- Use modern browsers (Chrome, Firefox, Safari, Edge)

## Troubleshooting

### Map Not Displaying
- Check browser console for errors
- Ensure WebGL is enabled in your browser
- Try a different browser

### Data Not Loading
- Verify Excel/CSV format matches requirements
- Check that coordinates are valid (latitude -90 to 90, longitude -180 to 180)
- Ensure timestamps are in valid date format

### Slow Performance
- Reduce hexagon resolution
- Decrease timeframe window
- Upload smaller datasets

## Contributing

Contributions are welcome! Please feel free to submit pull requests.

## License

MIT

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the Vercel deployment guide
3. Check browser console for error messages

---

**Version**: 1.0.0
**Last Updated**: December 4, 2025
**Status**: Production Ready ✓
