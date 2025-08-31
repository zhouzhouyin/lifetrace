<template>
  <view class="wrap">
    <view class="card">
      <view class="title">登录</view>
      <view class="field">
        <input class="input" type="text" placeholder="邮箱" v-model="email" />
      </view>
      <view class="field">
        <input class="input" :password="!showPwd" placeholder="密码" v-model="password" />
      </view>
      <view class="actions">
        <button class="btn-primary" @tap="onLogin" :loading="loading">登录</button>
        <button class="btn-tertiary" @tap="goRegister">去注册</button>
      </view>
      <view v-if="err" class="err">{{ err }}</view>
    </view>
  </view>
</template>

<script>
import { api } from '../../utils/api.js'
export default {
  data() {
    return { email: '', password: '', showPwd: false, loading: false, err: '' }
  },
  methods: {
    async onLogin() {
      if (this.loading) return
      this.err = ''
      if (!this.email || !this.password) {
        this.err = '请输入邮箱和密码'
        return
      }
      this.loading = true
      try {
        const data = await api.login({ email: this.email, password: this.password })
        if (data && data.token) {
          uni.setStorageSync('token', data.token)
          uni.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(() => {
            uni.reLaunch({ url: '/pages/index/index' })
          }, 400)
        } else {
          this.err = '登录失败，请稍后再试'
        }
      } catch (e) {
        this.err = (e && e.data && e.data.message) || '登录失败'
      } finally {
        this.loading = false
      }
    },
    goRegister() { uni.navigateTo({ url: '/pages/auth/register' }) }
  }
}
</script>

<style scoped>
.wrap { padding: 24rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.06); }
.title { font-size: 36rpx; font-weight: 700; margin-bottom: 16rpx; }
.field { margin-bottom: 16rpx; }
.input { background: #f3f4f6; border-radius: 12rpx; padding: 20rpx; font-size: 28rpx; }
.actions { display:flex; gap: 16rpx; }
.btn-primary { background-color: #4A90E2; color: #fff; border: none; padding: 16rpx 24rpx; border-radius: 12rpx; }
.btn-tertiary { background: transparent; color: #4A90E2; border: 1px solid #4A90E2; padding: 16rpx 24rpx; border-radius: 12rpx; }
.err { margin-top: 12rpx; color: #b91c1c; font-size: 24rpx; }
</style>


