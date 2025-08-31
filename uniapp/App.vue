<template>
  <view>
    <slot />
  </view>
</template>

<script>
export default {
  onLaunch() {
    try {
      const api = uni.getStorageSync('API_BASE')
      if (!api) {
        uni.setStorageSync('API_BASE', 'https://lifetrace-8go6kn9a1695be9f-1328638721.ap-shanghai.app.tcloudbase.com')
      }
    } catch (e) {}
  }
}
</script>

<style>
page { background-color: #f7f0dc; color: #111827; }
.card { background:#fff; border:1px solid #e5e7eb; border-radius: 10rpx; padding:24rpx; }
.btn-primary { background-color:#2563eb; color:#fff; }
.btn-secondary { background-color:#93c5fd; color:#111827; }
.btn-tertiary { background-color:#e5e7eb; color:#111827; }
</style>

