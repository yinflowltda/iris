# Circular Note Text Settings

Circular notes constrain text to the **inscribed square** of the circle (side = diameter / √2 ≈ 70.7% of diameter). This ensures text never overflows the visible circular area.

## Auto Font Size Reduction

When text exceeds a character threshold, the font size is progressively reduced to keep content within the visible area.

| Setting | Value | Description |
|---------|-------|-------------|
| `CHAR_THRESHOLD` | `100` | Character count above which font shrinking begins |
| `MIN_FONT_SCALE` | `0.45` | Minimum font size multiplier (45% of original) |

### Formula

```
fontScale = √(CHAR_THRESHOLD / charCount)
```

Clamped to `[MIN_FONT_SCALE, 1]`. The square root provides a gradual reduction curve.

### Examples

| Characters | Font Scale |
|------------|------------|
| ≤ 100 | 100% (no reduction) |
| 150 | ~82% |
| 200 | ~71% |
| 400 | ~50% |
| ≥ 494 | 45% (floor) |

### Source

`client/shapes/CircularNoteShapeUtil.tsx`
