const text=(label,required=false)=>({label,required});
const percentage=label=>({...text(label),percentage:true,hint:'Percentage, for example 18%.'});
const number=label=>({...text(label),type:'number'});
const date=label=>({...text(label),type:'date'});

// Labels and order follow each worksheet, including its spelling and separators.
export const gstMaster=[{name:'GST',columns:3,fields:[
  text('GST Location'),text('Tax_Code',true),text('Tax_Description',true),
  {...text('Supply_Type'),options:['Intrastate','Interstate']},
  {...text('Transaction_Nature'),options:['Forward Charge','Reverse Charge']},
  ...['Total_GST_Rate','CGST_Rate','SGST_UTGST_Rate','IGST_Rate'].map(percentage),
  text('Applicable_Sections_Rules'),{...text('RCM_Applicable'),options:['Yes','No']},
  {...text('ITC_Eligibility'),suggestions:['Eligible','Eligible (Post-Payment)']},
  date('Effective_From'),date('Effective_TO'),{...text('Status'),options:['Active','Inactive']},
  {...text('Key_Covered_Categories'),type:'textarea'},text('SAC/HSN CODE'),
]}];

export const taxMasterTds=[{name:'TDS',columns:3,fields:[
  text('TDS_Code',true),text('Nature_of_Payment',true),text('New_Section_2025'),text('Legacy_Section_1961'),
  text('TRACES_Code'),{...text('Deductee_Type'),suggestions:['Resident Individual / HUF','Resident Company / Firm / LLP','Resident Seller']},
  percentage('Standard_Rate_%'),percentage('No_PAN_Rate_%'),number('Single_Threshold_INR'),number('Aggregate_Threshold_INR'),
  text('Threshold_Calculation_Rule'),text('Return_Form'),text('GL_Account_Mapping'),
  {...text('Status'),options:['Active','Inactive']},
  {...text('Attachment Notification upload'),type:'file'},date('Effective From'),date('Effective To'),
]}];
