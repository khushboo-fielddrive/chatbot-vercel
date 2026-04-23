'use client'

import { PostHogProvider } from 'posthog-js/react'
import usePostHog from '@/hooks/use-posthog'
import PostHogPageView from './posthog-page-view'

export default function PostHogClientProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const posthog = usePostHog()

  return (
    <PostHogProvider client={posthog}>
      {children}
      <PostHogPageView />
    </PostHogProvider>
  )
}
