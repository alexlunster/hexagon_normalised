# Demand-Supply Analyzer - TODO

## Core Features
- [x] Dual CSV upload: "Demand Upload" and "Supply Upload" buttons
- [x] Parse demand CSV (timestamp, latitude, longitude)
- [x] Parse supply CSV (start_time, end_time, latitude, longitude)
- [x] Calculate demand/supply ratio per hexagon
- [x] Display ratio coefficient in hexagon centers
- [x] Supply calculation at snapshot time only (no timeframe window)
- [x] Demand calculation with timeframe window (existing logic)

## Technical Tasks
- [x] Update ControlPanel with two upload buttons
- [x] Implement supply CSV parser
- [x] Add supply state management
- [x] Update hexagon aggregation logic for ratio calculation
- [x] Modify label display to show ratio instead of count (shows ∞ for infinite ratio)
- [x] Handle division by zero (no supply vehicles)
- [x] Test with provided Berlin CSV files (ready to test at https://3002-ichkdzv4n2f4p2d4mvi7j-e2c99c7b.manus.computer)
