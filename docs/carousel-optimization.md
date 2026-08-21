# Post Carousel Optimization

## Performance Improvements Implemented

### 1. Image Format Conversion (PNG → WebP)

**Problem**: Large PNG images (742KB - 4MB each) were causing slow load times and potential rendering lag.

**Solution**:

- Converted all 10 post images from PNG to WebP format using Sharp
- Achieved 40-60% file size reduction
- Example: Article (2).png: 4044KB → 1608KB (60% reduction)

**Benefits**:

- Faster image downloads
- Reduced bandwidth usage
- Better browser rendering performance
- Native browser support for WebP across modern browsers

### 2. Simplified Carousel Initialization

**Problem**: Multiple watchers and `reInit()` calls were causing race conditions and unnecessary re-renders.

**Original Issues**:

- Manual `reInit()` after data load
- Separate watcher for data length changes
- Multiple console.log statements causing overhead
- Complex listener attachment/detachment logic

**Solution**:

- Removed redundant watchers and manual `reInit()` calls
- Consolidated event listener setup into a single watcher
- Cleaned up debugging code
- Simplified lifecycle with proper Vue 3 composition API patterns

**Benefits**:

- Eliminates race conditions during initialization
- Reduces unnecessary re-renders
- Cleaner, more maintainable code
- Better performance on data load

### 3. Smart Image Loading Strategy

**Problem**: All images were lazy-loaded equally, causing visible images to load slowly.

**Solution**:

- First 3 images: `loading="eager"` + `fetchpriority="high"`
- Remaining images: `loading="lazy"` + `fetchpriority="low"`
- Added `decoding="async"` for non-blocking decode

**Benefits**:

- Visible carousel slides load immediately
- Off-screen slides load progressively
- Better perceived performance
- Optimized browser resource allocation

### 4. Loading Skeleton UI

**Problem**: Users saw blank space during data fetch, poor perceived performance.

**Solution**:

- Added animated skeleton placeholders
- Shows 3 skeleton cards during load
- Respects `prefers-reduced-motion` for accessibility
- Matches actual card dimensions

**Benefits**:

- Better perceived performance
- Clear loading state feedback
- Professional user experience
- Accessibility-friendly

### 5. CSS Performance Enhancements

**Problem**: Potential layout shifts and paint operations during carousel interactions.

**Solution**:

- Added `will-change: transform` to carousel container and slides
- Added `will-change: opacity` to images
- Maintained hardware acceleration with `transform: translateZ(0)`
- Added `prefers-reduced-motion` support

**Benefits**:

- Smoother carousel animations
- Better GPU utilization
- Reduced layout thrashing
- Improved accessibility

## Technical Details

### Embla Carousel Configuration

```typescript
{
  align: 'start',
  loop: false,
  skipSnaps: false,
  breakpoints: {
    '(min-width: 768px)': { slidesToScroll: 2 },
    '(min-width: 1024px)': { slidesToScroll: 3 },
  },
}
```

### Image Loading Logic

```typescript
const getImagePriority = (idx: number): 'high' | 'low' => {
  return idx < 3 ? 'high' : 'low'
}

const getImageLoading = (idx: number): 'eager' | 'lazy' => {
  return idx < 3 ? 'eager' : 'lazy'
}
```

## File Size Comparison

| Image           | PNG Size      | WebP Size     | Reduction |
| --------------- | ------------- | ------------- | --------- |
| Article.png     | 3,203 KB      | 1,411 KB      | 56%       |
| Article (1).png | 1,874 KB      | 826 KB        | 56%       |
| Article (2).png | 4,045 KB      | 1,609 KB      | 60%       |
| Article (3).png | 1,698 KB      | 748 KB        | 56%       |
| Article (4).png | 3,391 KB      | 1,519 KB      | 55%       |
| Article (5).png | 2,948 KB      | 1,325 KB      | 55%       |
| Article (6).png | 2,068 KB      | 952 KB        | 54%       |
| Article (7).png | 2,594 KB      | 1,106 KB      | 57%       |
| Article (8).png | 1,020 KB      | 451 KB        | 56%       |
| Article (9).png | 743 KB        | 300 KB        | 60%       |
| **Total**       | **23,584 KB** | **10,247 KB** | **57%**   |

## Best Practices Applied

### 1. Progressive Enhancement

- Content loads in stages (skeleton → data → images)
- Critical images prioritized
- Graceful degradation for older browsers

### 2. Accessibility

- Proper ARIA labels maintained
- Keyboard navigation preserved
- `prefers-reduced-motion` respected
- Screen reader support with `.sr-only` class

### 3. Performance

- Minimal re-renders with optimized watchers
- Hardware-accelerated animations
- Efficient image loading strategy
- Smaller asset sizes

### 4. Maintainability

- Cleaner, more focused code
- Removed debug logging
- Clear helper functions
- Standard Vue 3 patterns

## Testing Recommendations

1. **Network Throttling**: Test with slow 3G to verify progressive loading
2. **Browser DevTools**: Monitor:
   - Network waterfall for image load order
   - Performance tab for paint operations
   - Memory usage during carousel interaction
3. **Real Devices**: Test on mobile devices for touch interactions
4. **Lighthouse**: Run audit for performance metrics (should see improved scores)

## Future Enhancements

Consider for next iteration:

1. **Responsive images**: Add `srcset` for different viewport sizes
2. **Image CDN**: Consider using a CDN with automatic optimization
3. **Intersection Observer**: Add visibility detection for even smarter loading
4. **Prefetch**: Prefetch next slide's image on hover/focus
5. **AVIF format**: For browsers that support it, AVIF offers even better compression

## Files Modified

1. `src/components/PostsCarousel.vue` - Optimized carousel logic and added loading skeleton
2. `public/content/posts.json` - Updated image paths to WebP
3. `scripts/convert-images-to-webp.js` - New conversion script
4. `public/images/posts/webp/` - New directory with optimized images

## Migration Notes

- Original PNG images preserved in `public/images/posts/`
- WebP images located in `public/images/posts/webp/`
- To revert: Update `posts.json` image paths back to `.png`
- To convert more images: Run `node scripts/convert-images-to-webp.js`

## Performance Impact

**Expected improvements**:

- **Initial page load**: 40-60% faster carousel section
- **Time to Interactive**: Reduced by ~1-2 seconds
- **Lighthouse Performance Score**: +5-10 points
- **Perceived performance**: Immediate skeleton feedback
- **Bandwidth savings**: 57% reduction in image data transfer
