<template>
  <view class="wrap">
    <view class="card">
      <view class="title">注册</view>
      <view class="field">
        <input class="input" type="text" placeholder="邮箱" v-model="email" />
      </view>
      <view class="field">
        <input class="input" :password="!showPwd" placeholder="密码（至少6位）" v-model="password" />
      </view>
      <view class="field">
        <checkbox :checked="agree" @tap="agree = !agree" />
        <text class="agree">我已阅读并同意 服务条款 与 隐私政策</text>
      </view>
      <view class="actions">
        <button class="btn-primary" :disabled="!agree" @tap="onRegister" :loading="loading">注册</button>
        <button class="btn-tertiary" @tap="goLogin">去登录</button>
      </view>
      <view v-if="err" class="err">{{ err }}</view>
    </view>
  </view>
</template>

<script>
import { api } from '../../utils/api.js'
export default {
  data() {
    return { email: '', password: '', showPwd: false, agree: true, loading: false, err: '' }
  },
  methods: {
    async onRegister() {
      if (this.loading) return
      this.err = ''
      if (!this.email || !this.password) {
        this.err = '请输入邮箱和密码'
        return
      }
      if (!this.agree) { this.err = '请先同意条款'; return }
      this.loading = true
      try {
        const data = await api.register({ email: this.email, password: this.password })
        if (data && data.token) {
          uni.setStorageSync('token', data.token)
          uni.showToast({ title: '注册成功', icon: 'success' })
          setTimeout(() => { uni.reLaunch({ url: '/pages/index/index' }) }, 400)
        } else {
          this.err = '注册失败，请稍后再试'
        }
      } catch (e) {
        this.err = (e && e.data && e.data.message) || '注册失败'
      } finally { this.loading = false }
    },
    goLogin() { uni.navigateTo({ url: '/pages/auth/login' }) }
  }
}
</script>

<style scoped>
.wrap { padding: 24rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.06); }
.title { font-size: 36rpx; font-weight: 700; margin-bottom: 16rpx; }
.field { margin-bottom: 16rpx; display:flex; align-items:center; gap: 12rpx; }
.input { background: #f3f4f6; border-radius: 12rpx; padding: 20rpx; font-size: 28rpx; flex:1; }
.actions { display:flex; gap: 16rpx; }
.btn-primary { background-color: #4A90E2; color: #fff; border: none; padding: 16rpx 24rpx; border-radius: 12rpx; }
.btn-tertiary { background: transparent; color: #4A90E2; border: 1px solid #4A90E2; padding: 16rpx 24rpx; border-radius: 12rpx; }
.agree { font-size: 24rpx; color:#374151; }
.err { margin-top: 12rpx; color: #b91c1c; font-size: 24rpx; }
</style>


