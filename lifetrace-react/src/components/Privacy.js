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
          <li><strong>您指定的遗产联系人信息</strong>：您在“永恒计划”中提供的、用于未来传承的联系人姓名、联系方式和地址。</li>
          <li><strong>技术与交互信息</strong>：在您使用服务过程中，我们可能自动收集的设备信息、操作日志、访问记录等。</li>
          <li><strong>【特别提示】AI数字遗产所需信息</strong>：若您选择开通AI数字遗产服务，我们将基于您的明确授权，收集您的语音、面部特征、神情动作、口头禅等生物识别信息和个性化数据。</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-4">二、我们如何使用您的信息</h2>
        <h3 className="text-lg font-medium mt-4 mb-2">核心服务</h3>
        <p className="text-gray-700 mb-4">
          您的信息将用于创建、编辑和长期保存您的传记内容，确保其在您指定的情况下得以传承。
        </p>
        <h3 className="text-lg font-medium mt-4 mb-2">“永恒计划”</h3>
        <p className="text-gray-700 mb-4">
          您的信息将用于履行我们对您的承诺，包括但不限于数据备份、生成实体印记、并在您指定的时间联系您的遗产联系人。
        </p>
        <h3 className="text-lg font-medium mt-4 mb-2">AI与数字遗产</h3>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li>您的语音、面部及其他生物识别信息，将仅用于为您生成专属的AI复活模型，用于您的后代在获得授权后与之进行交互。</li>
          <li>我们承诺，您的AI模型不会被用于任何第三方商业用途，也不会被用于训练通用AI模型。</li>
          <li>除非您明确授权，我们不会将您的AI模型或生物识别信息提供给任何第三方。</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-4">三、我们如何存储和保护您的信息</h2>
        <p className="text-gray-700 mb-4">
          我们承诺您的数据安全：
        </p>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li><strong>数据安全</strong>：我们采用行业领先的数据加密技术、访问控制和多重备份机制，以防止您的数据被未经授权的访问、丢失或泄露。</li>
          <li><strong>存储地点</strong>：您的数据将存储在安全可靠的服务器中，我们承诺遵守相关法律法规。</li>
          <li><strong>“永恒”承诺</strong>：对于“永恒计划”付费用户，我们将通过技术手段（如数据多重冗余备份、分布式存储、或未来采用的区块链技术）来确保您的数据得以长期保存。</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-4">四、您的权利</h2>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li><strong>访问与更正</strong>：您可以随时访问和更正您的个人信息和传记内容。</li>
          <li><strong>删除权</strong>：在法律允许的范围内，您可以请求我们删除您的个人信息。但请注意，若您已购买“永恒计划”，删除该服务将视为放弃我们对您提供的永恒承诺。</li>
          <li><strong>注销账户</strong>：您可以联系我们注销您的账户。</li>
          <li><strong>知情同意</strong>：若我们计划将您的信息用于本政策未涵盖的用途，我们将再次获得您的明确同意。</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-4">五、联系我们</h2>
        <p className="text-gray-700 mb-6">
          如果您对本政策有任何疑问，请通过 <a href="mailto:1056829015@qq.com" className="text-blue-600 hover:underline">1056829015@qq.com</a> 与我们联系。
        </p>

        <button className="btn bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition" onClick={() => navigate(-1)}>返回</button>
      </div>
    </div>
  );
};

export default Privacy;


