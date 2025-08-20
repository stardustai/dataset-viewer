# Load More Button Mockup

Since I cannot take a live screenshot in this environment, here's a description of how the Load More button will appear in the UI:

## Visual Design

The Load More button appears at the bottom of the file list with the following characteristics:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  📁 folder1                    2.3 KB  2 hours ago  │
│  📄 file1.txt                  1.2 KB  1 hour ago   │
│  📄 file2.json                 856 B   30 min ago   │
│  📁 folder2                    4.5 KB  15 min ago   │
│  ... (998 more files) ...                          │
│  📄 file1000.csv               3.1 KB  1 min ago    │
│                                                     │
├─────────────────────────────────────────────────────┤
│                    ┌─────────────────┐              │
│                    │  ⬇️ Load More    │              │
│                    │     Files       │              │
│                    └─────────────────┘              │
│                1000 files loaded                    │
└─────────────────────────────────────────────────────┘
```

## Loading State

When clicked, the button shows a loading spinner:

```
┌─────────────────────────────────────────────────────┐
│                    ┌─────────────────┐              │
│                    │ ⏳ Loading more  │              │
│                    │    files...     │              │
│                    └─────────────────┘              │
│                1000 files loaded                    │
└─────────────────────────────────────────────────────┘
```

## After Loading More

After successful loading, new files are appended and count is updated:

```
┌─────────────────────────────────────────────────────┐
│  📄 file1001.txt               2.1 KB  3 min ago    │
│  📁 folder3                    1.8 KB  5 min ago    │
│  📄 file1002.json              4.2 KB  8 min ago    │
│  ... (500 more files) ...                          │
│  📄 file1500.csv               1.9 KB  1 hour ago   │
│                                                     │
├─────────────────────────────────────────────────────┤
│                    ┌─────────────────┐              │
│                    │  ⬇️ Load More    │              │
│                    │     Files       │              │
│                    └─────────────────┘              │
│                1500 files loaded                    │
└─────────────────────────────────────────────────────┘
```

## When All Files Loaded

When there are no more files to load, the button disappears:

```
┌─────────────────────────────────────────────────────┐
│  📄 file2000.txt               1.3 KB  2 hours ago  │
│  📁 folder5                    3.7 KB  3 hours ago  │
│  📄 final-file.json            892 B   4 hours ago  │
│                                                     │
│            📄 All files loaded (2000 total)         │
└─────────────────────────────────────────────────────┘
```

## Styling Details

- **Button**: Blue gradient background (#3B82F6 to #1D4ED8)
- **Text**: White text with medium font weight
- **Icon**: Chevron down icon (⬇️) or loading spinner (⏳)
- **State**: Hover effects and disabled state during loading
- **Position**: Centered horizontally, with padding above and below
- **Border**: Subtle top border to separate from file list
- **Count**: Gray text showing total loaded files

This design follows the existing UI patterns in the application and provides clear visual feedback to users about the pagination state.