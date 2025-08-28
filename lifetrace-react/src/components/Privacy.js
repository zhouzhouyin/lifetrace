import React from 'react';
import { useNavigate } from 'react-router-dom';

const Privacy = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="card max-w-3xl mx-auto w-full p-6 bg-white shadow-md rounded-lg">
        <h1 className="text-2xl font-bold mb-6">隐私政策</h1>

        <h2 className="text-xl font-semibold mt-6 mb-4">引言</h2>
        <p className="text-gray-700 mb-4">
          本《隐私政策》旨在帮助您了解我们如何收集、使用、存储和保护您的个人信息，以及您拥有的权利。我们深知您托付给我们的不仅是数据，更是您宝贵的人生故事和对未来的期盼。我们将以最高的标准来守护您的数字遗产。
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-4">一、我们收集的信息</h2>
        <p className="text-gray-700 mb-4">
          为了向您提供“记录生命，对抗遗忘”的服务，我们可能收集以下信息：
        </p>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li><strong>您主动提供的信息</strong>：您在注册、创建传记和使用服务时填写的个人资料（如姓名、联系方式），以及您主动上传的所有内容（包括文字、图片、音频、视频等）。</li>
          <li><strong>家庭与关系信息</strong>：在家族档案与共享功能中，用于实现亲属关系展示与共享的必要信息。</li>
          <li><strong>技术与交互信息</strong>：在您使用服务过程中，我们可能自动收集的设备信息、操作日志、访问记录等。</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-4">二、我们如何使用您的信息</h2>
        <h3 className="text-lg font-medium mt-4 mb-2">核心服务</h3>
        <p className="text-gray-700 mb-4">
          您的信息将用于创建、编辑和长期保存您的传记内容，确保其在您指定的情况下得以传承。
        </p>
        {/* 当前不提供付费“永恒计划”与AI生物识别类服务，后续如上线将另行公告并征得同意 */}

        <h2 className="text-xl font-semibold mt-6 mb-4">三、我们如何存储和保护您的信息</h2>
        <p className="text-gray-700 mb-4">
          我们承诺您的数据安全：
        </p>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li><strong>数据安全</strong>：采用加密传输、访问控制与必要的备份机制，防止未经授权访问、泄露与丢失。</li>
          <li><strong>存储地点</strong>：数据在依法合规的服务器中存储，并遵守中国大陆适用法律法规。</li>
          <li><strong>数据最小化</strong>：仅收集提供服务所必需的信息，并尽量缩短保存期限。</li>
        </ul>

        <h3 className="text-lg font-medium mt-4 mb-2">未成年人保护</h3>
        <p className="text-gray-700 mb-4">若您为未满14周岁的未成年人，请在监护人同意与指导下使用本服务；我们不主动收集未成年人敏感信息。</p>

        <h3 className="text-lg font-medium mt-4 mb-2">跨境提供</h3>
        <p className="text-gray-700 mb-4">目前不进行个人信息跨境提供。若业务需要跨境传输，将依法履行评估与申报并征得您的单独同意。</p>

        <h2 className="text-xl font-semibold mt-6 mb-4">四、您的权利</h2>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li><strong>访问与更正</strong>：您可以随时访问和更正您的个人信息与内容。</li>
          <li><strong>删除</strong>：在法律允许范围内，您可请求删除您的个人信息与内容。</li>
          <li><strong>撤回同意</strong>：您可随时撤回对可选功能的授权。</li>
          <li><strong>注销账户</strong>：可通过联系邮箱申请注销。</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-4">五、联系我们</h2>
        <p className="text-gray-700 mb-6">
          如果您对本政策有任何疑问，请通过 <a href="mailto:1056829015@qq.com" className="hover:underline" style={{ color: '#e7c36f' }}>1056829015@qq.com</a> 与我们联系。
        </p>

        <button className="btn bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition" onClick={() => navigate(-1)}>返回</button>
      </div>
    </div>
  );
};

export default Privacy;


