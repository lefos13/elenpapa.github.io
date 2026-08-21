// Eager load HomePage for fastest initial render
import HomePage from '@/views/HomePage.vue'

// Lazy load secondary pages to reduce initial bundle size
const TimelinePage = () => import('@/views/TimelinePage.vue')
const PostPage = () => import('@/views/PostPage.vue')
const BookPage = () => import('@/views/BookPage.vue')
const MoonlightPage = () => import('@/views/MoonlightPage.vue')
const PaintedBooksPage = () => import('@/views/PaintedBooksPage.vue')

// Export routes for vite-ssg
export const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
  },
  {
    path: '/timeline',
    name: 'timeline',
    component: TimelinePage,
  },
  {
    path: '/book',
    name: 'book',
    component: BookPage,
  },
  {
    path: '/moonlight',
    name: 'moonlight',
    component: MoonlightPage,
  },
  {
    path: '/painted-books',
    name: 'painted-books',
    component: PaintedBooksPage,
  },
  {
    path: '/posts/:id',
    name: 'post',
    component: PostPage,
  },
]
