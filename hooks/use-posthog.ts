import { useEffect } from 'react'
import posthog, { type PostHog } from 'posthog-js'

export default function usePostHog() {
  useEffect(() => {
    const postHogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY || ''
    const postHogOptions: any = {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      capture_pageview: false,
      loaded: (posthogInstance: PostHog) => {
        console.log(`PostHog initialized in ${process.env.NEXT_PUBLIC_POSTHOG_ENV} mode`)
        posthogInstance.register({
          environment: process.env.NEXT_PUBLIC_POSTHOG_ENV || 'unknown',
        })
      },
    }
    if (typeof window !== 'undefined' && postHogKey) {
      posthog.init(postHogKey, postHogOptions)
    }
  }, [])
  return posthog
}
