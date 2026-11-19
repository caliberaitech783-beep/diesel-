// Keep document numbers, master values and user-entered text in their original language.
const labels={
  'Browse entries':'प्रविष्टियाँ देखें','Records':'रिकॉर्ड','Clear filters':'फ़िल्टर हटाएँ','Skip to workspace':'कार्यक्षेत्र पर जाएँ',
  'Entry register':'प्रविष्टि रजिस्टर','Diesel entries':'डीज़ल प्रविष्टियाँ','Local review · sample data':'स्थानीय समीक्षा · नमूना डेटा',
  'Buy':'खरीद','Receive':'प्राप्ति','Store and issue':'भंडारण और निर्गम','Money':'लेखा','Control':'नियंत्रण','← Masters':'← मास्टर्स',
  'Site':'साइट','Review role':'समीक्षा की भूमिका','Switch':'बदलें','Search':'खोजें','Status':'स्थिति','Filter':'फ़िल्टर','Export CSV':'CSV निर्यात करें',
  'Draft':'मसौदा','Drafts':'मसौदे','Posted':'दर्ज','Awaiting approval':'अनुमोदन लंबित','Awaiting Treasury':'कोषागार की प्रतीक्षा','In transit':'रास्ते में','Receipt review':'प्राप्ति समीक्षा','Returned':'वापस भेजा गया','Superseded':'संशोधित','All statuses':'सभी स्थितियाँ',
  'Entry':'प्रविष्टि','Document':'दस्तावेज़','Business day':'कार्य दिवस','New entry':'नई प्रविष्टि','New draft':'नया मसौदा','Open diesel indent':'डीज़ल मांग खोलें','No entries match this view.':'इस सूची में कोई प्रविष्टि नहीं है।',
  'Entry details':'प्रविष्टि विवरण','History':'इतिहास','Calculated and carried forward':'गणना और पिछली प्रविष्टि से विवरण','Site stock':'साइट का स्टॉक',
  'Save draft':'मसौदा सहेजें','Submit':'जमा करें','Approve':'अनुमोदित करें','Return':'वापस भेजें','Reason for return':'वापस भेजने का कारण','Confirm UTR':'UTR की पुष्टि करें','Confirm receipt':'प्राप्ति की पुष्टि करें','Approve transfer variance':'अंतर अनुमोदित करें','Capture GPS':'GPS दर्ज करें',
  'Scan storage or vehicle tag':'भंडारण या वाहन टैग स्कैन करें','Use scanned tag':'स्कैन किया टैग चुनें','Select…':'चुनें…','Remarks':'टिप्पणी','Reason code':'कारण कोड','Required by':'आवश्यक तिथि',
  'Diesel indent':'डीज़ल मांग','Purchase order':'खरीद आदेश','Payment advice and UTR':'भुगतान सलाह और UTR','Gate entry':'गेट प्रविष्टि','Inspection':'निरीक्षण','Goods receipt note':'माल प्राप्ति नोट',
  'Supplier bill match':'आपूर्तिकर्ता बिल मिलान','Debit note and freight bill':'डेबिट नोट और भाड़ा बिल','UG tank to bowser':'भूमिगत टैंक से बाउज़र','Tank truck to bowser':'टैंक ट्रक से बाउज़र','Tank truck empty confirmation':'टैंक ट्रक खाली होने की पुष्टि',
  'Vehicle fuel issue':'वाहन ईंधन निर्गम','Inter-site transfer':'अंतर-साइट स्थानांतरण','Contractor recovery':'ठेकेदार वसूली','Retail pump purchase':'पेट्रोल पंप से खरीद','Daily count and reconciliation':'दैनिक गिनती और मिलान','Correction request':'सुधार अनुरोध','Month-end close':'माह समाप्ति',
  'Requested quantity (L)':'मांगी गई मात्रा (लीटर)','Approved indent':'अनुमोदित मांग','PO type':'खरीद आदेश प्रकार','Supplier':'आपूर्तिकर्ता','Depot':'डिपो','Delivery basis':'डिलीवरी का आधार','Quantity (KL)':'मात्रा (KL)','Transporter':'परिवहनकर्ता','Payment terms':'भुगतान शर्तें','Amount to pay (₹)':'देय राशि (₹)',
  'Receipt scenario':'प्राप्ति का प्रकार','Truck registration':'ट्रक पंजीकरण','Driver name':'चालक का नाम','Driver mobile':'चालक का मोबाइल','Fitness valid until':'फिटनेस वैधता','Explosive licence valid until':'विस्फोटक लाइसेंस वैधता','Supplier invoice number':'आपूर्तिकर्ता चालान संख्या','Invoice date':'चालान तिथि','Invoice quantity (L)':'चालान मात्रा (लीटर)','E-way bill number':'ई-वे बिल संख्या','Compartment seal numbers (comma-separated)':'कक्षों की सील संख्या (अल्पविराम से अलग करें)','Seals intact':'सील सही है','Compartment seal photos':'कक्षों की सील के फोटो','Bill photo':'बिल का फोटो',
  'Tanker gate entry':'टैंकर गेट प्रविष्टि','Observed density (kg/m³)':'मापा घनत्व (kg/m³)','Temperature (°C)':'तापमान (°C)','Measuring instrument':'माप उपकरण','Underground tank':'भूमिगत टैंक','Dip before (cm)':'प्रारंभिक डिप (सेमी)','Dip after (cm)':'अंतिम डिप (सेमी)','Decision':'निर्णय','Inspection note and dip photos':'निरीक्षण नोट और डिप फोटो',
  'Supplier bill number':'आपूर्तिकर्ता बिल संख्या','Bill date':'बिल तिथि','Bill quantity (L)':'बिल मात्रा (लीटर)','Bill rate (₹/KL)':'बिल दर (₹/KL)','Invoice discount (₹/KL)':'चालान छूट (₹/KL)','Freight bill number':'भाड़ा बिल संख्या','Freight bill date':'भाड़ा बिल तिथि','Bowser':'बाउज़र','Bowser meter start (L)':'बाउज़र मीटर आरंभ (लीटर)','Bowser meter end (L)':'बाउज़र मीटर अंत (लीटर)','Meter photos':'मीटर के फोटो','Confirm tanker is empty':'टैंकर खाली होने की पुष्टि','Empty compartment photos':'खाली कक्षों के फोटो',
  'Vehicle or fleet number':'वाहन या फ्लीट संख्या','Driver':'चालक','Vehicle hour meter':'वाहन का घंटा मीटर','Vehicle meter photo':'वाहन मीटर फोटो','Sending storage':'भेजने का भंडारण','Receiving storage at other site':'दूसरी साइट का भंडारण','Dispatched litres':'भेजे गए लीटर','Dispatch meter photo':'प्रेषण मीटर फोटो','Received litres':'प्राप्त लीटर','Receipt evidence':'प्राप्ति प्रमाण','Variance reason':'अंतर का कारण',
  'Recovery party':'वसूली पार्टी','Period from':'अवधि आरंभ','Period to':'अवधि समाप्त','Recovery rate basis':'वसूली दर का आधार','Recovery method':'वसूली विधि','Retail pump':'पेट्रोल पंप','Slip number':'पर्ची संख्या','Slip date':'पर्ची तिथि','Litres':'लीटर','Rate on slip (₹/L)':'पर्ची की दर (₹/लीटर)','Slip amount (₹)':'पर्ची की राशि (₹)','Kilometre reading':'किलोमीटर रीडिंग','Slip photo':'पर्ची का फोटो','UG tank dip (cm)':'भूमिगत टैंक डिप (सेमी)','Bowser measured stock (L)':'बाउज़र का मापा स्टॉक (लीटर)','Variance evidence':'अंतर का प्रमाण',
  'Posted entry':'दर्ज प्रविष्टि','Field to correct':'सुधार का फ़ील्ड','Corrected value':'सही मान','Correction evidence':'सुधार का प्रमाण','Month to close':'बंद करने का माह','Bank UTR':'बैंक UTR','Payment date':'भुगतान तिथि','Project':'परियोजना','Item':'आइटम','Tank and bowser stock (L)':'टैंक और बाउज़र स्टॉक (लीटर)','In transit (L)':'रास्ते में (लीटर)','Average daily issue (L)':'औसत दैनिक निर्गम (लीटर)','Days of stock':'स्टॉक के दिन','Suggested request (L)':'सुझाई गई मात्रा (लीटर)',
};
const language=document.getElementById('entry-language');
if(localStorage.getItem('diesel-entry-language')==='hi'){
  document.documentElement.lang='hi';language.textContent='English';
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    const node=walker.currentNode, key=node.data.trim();
    if(!node.parentElement.closest('script,output,dd,ol,textarea') && Object.hasOwn(labels,key))node.data=node.data.replace(key,labels[key]);
  }
}
language.addEventListener('click',()=>{
  localStorage.setItem('diesel-entry-language',document.documentElement.lang==='hi'?'en':'hi');location.reload();
});
