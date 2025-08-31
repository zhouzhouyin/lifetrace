<template>
  <view class="screen">
    <view class="hero compact">
      <view class="title">永念</view>
      <view class="subtitle">把一生好好写下，温柔地交给时间</view>
      <button class="btn-primary cta small" @tap="go('/pages/daily/index')">每日回首</button>
    </view>
    <view class="list">
      <view class="item" @tap="go('/pages/create/index')">
        <view class="left">✍️</view>
        <view class="right">
          <view class="txt">开始记录</view>
          <view class="sub">从童年至当下，一步步写下</view>
        </view>
      </view>
      <view class="item" @tap="go('/pages/memo/index')">
        <view class="left">📒</view>
        <view class="right">
          <view class="txt">随手记</view>
          <view class="sub">几句话、一张照片或语音</view>
        </view>
      </view>
      <view class="item" @tap="go('/pages/family/index')">
        <view class="left">👪</view>
        <view class="right">
          <view class="txt">家族档案</view>
          <view class="sub">只与家人私密共享</view>
        </view>
      </view>
      <view class="item" @tap="go('/pages/my/index')">
        <view class="left">✨</view>
        <view class="right">
          <view class="txt">我的</view>
          <view class="sub">管理我的篇章与素材</view>
        </view>
      </view>
    </view>

    <view v-if="showSubject" class="overlay">
      <view class="modal">
        <view class="m-title">请选择记录对象</view>
        <view class="m-tip">首次使用需设置，保存前无法关闭</view>
        <view class="seg">
          <button :class="['seg-btn', subjectMode==='self' ? 'on' : '']" @tap="subjectMode='self'">为自己</button>
          <button :class="['seg-btn', subjectMode==='other' ? 'on' : '']" @tap="subjectMode='other'">为他人</button>
        </view>
        <input v-if="subjectMode==='other'" class="m-input" v-model="relation" placeholder="与被记录者关系（如：父亲、母亲、朋友）" />
        <button class="btn-primary m-save" @tap="saveSubject">保存</button>
      </view>
    </view>
  </view>
  </template>

<script>
export default {
  data(){
    return { showSubject: false, subjectMode: 'self', relation: '' }
  },
  onShow(){
    try {
      const mode = uni.getStorageSync('record_mode')
      if (!mode) { this.showSubject = true }
      // 若未配置后端域名，自动写入云函数域名（可按需修改）
      const apiBase = uni.getStorageSync('API_BASE')
      if (!apiBase) {
        uni.setStorageSync('API_BASE', 'https://lifetrace-8go6kn9a1695be9f-1328638721.ap-shanghai.app.tcloudbase.com')
      }
    } catch(e){ this.showSubject = true }
  },
  methods: {
    go(url) { uni.navigateTo({ url }) },
    saveSubject(){
      if (this.subjectMode === 'other' && !this.relation) {
        uni.showToast({ title:'请填写关系', icon:'none' }); return
      }
      uni.setStorageSync('record_mode', this.subjectMode)
      if (this.relation) uni.setStorageSync('record_relation', this.relation)
      this.showSubject = false
      uni.showToast({ title:'已保存', icon:'success' })
    }
  }
}
</script>

<style scoped>
.screen { min-height: 100vh; padding: 24rpx; display:flex; flex-direction: column; }
.hero { flex: 0 0 auto; display:flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40rpx 0 12rpx; }
.hero.compact .title { font-size: 48rpx; }
.hero.compact .subtitle { font-size: 24rpx; margin-bottom: 12rpx; }
.title { font-size: 56rpx; font-weight: 800; margin-bottom: 8rpx; color: #111827; }
.subtitle { font-size: 26rpx; color: #374151; margin-bottom: 20rpx; }
.cta { margin-top: 8rpx; padding: 16rpx 24rpx; border-radius: 12rpx; }
.cta.small { padding: 14rpx 22rpx; font-size: 26rpx; }
.btn-primary { background-color: #4A90E2; color: #ffffff; border: none; }
.btn-primary:active { background-color: #3f7bc8; }
.list { display: flex; flex-direction: column; gap: 16rpx; margin-top: 8rpx; }
.item { display:flex; gap: 16rpx; padding: 20rpx; border:1px solid #e5e7eb; border-radius: 14rpx; background: linear-gradient(135deg, #dbeafe 0%, #ffffff 70%); }
.left { width: 64rpx; font-size: 44rpx; display:flex; align-items: center; justify-content: center; }
.right { flex:1; }
.txt { font-weight: 700; color: #111827; margin-bottom: 4rpx; }
.sub { font-size: 24rpx; color: #374151; }
.bottom { margin-top: 16rpx; display:flex; justify-content: center; }

.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display:flex; align-items: center; justify-content: center; z-index: 999; }
.modal { width: 86%; background:#fff; border-radius: 16rpx; padding: 24rpx; box-shadow: 0 12rpx 36rpx rgba(0,0,0,0.18); }
.m-title { font-size: 34rpx; font-weight: 700; margin-bottom: 8rpx; }
.m-tip { font-size: 24rpx; color:#6b7280; margin-bottom: 12rpx; }
.seg { display:flex; gap: 12rpx; margin-bottom: 12rpx; }
.seg-btn { flex:1; padding: 14rpx 0; border-radius: 12rpx; border:1px solid #e5e7eb; background:#f9fafb; color:#374151; }
.seg-btn.on { background:#4A90E2; color:#fff; border-color:#4A90E2; }
.m-input { background:#f3f4f6; border-radius: 12rpx; padding: 18rpx; font-size: 28rpx; }
.m-save { margin-top: 16rpx; }
</style>

