const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{},document:{addEventListener(){}},setTimeout(){},clearTimeout(){},Intl,Date,Number,console};
vm.runInNewContext(fs.readFileSync(__dirname+'/../assets/employee-wage-preview-v1.js','utf8'),context);
const api=context.window.SFBackend.wagePreview;
test('hourly rate accepts comma/dot without accepting negative or malformed money',()=>{
 for(const value of ['15,50','15.50',' 15,50 '])assert.equal(api.parseRateCents(value),1550);
 assert.equal(api.parseRateCents('15,'),1500);
 for(const value of ['', '0','-15','Infinity','15,555','1.000,00','<script>'])assert.equal(api.parseRateCents(value),null);
});
test('wage components add up exactly in cents and keep established premium rates',()=>{
 const result=api.calculateCents({paid_seconds:90000,night_seconds:50400,sunday_seconds:32400,holiday_seconds:7200},1550);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{base:38750,night:4340,sunday:6975,holiday:3100,premiums:14415,total:53165});
});
test('six paid night hours include the full base wage plus twenty percent',()=>{
 const result=api.calculateCents({paid_seconds:21600,night_seconds:21600,sunday_seconds:0,holiday_seconds:0},1550);
 assert.equal(result.base,9300);assert.equal(result.night,1860);assert.equal(result.total,11160);
});
test('seconds are converted directly to money without rounding up to a minute',()=>{
 const result=api.calculateCents({paid_seconds:30,night_seconds:0,sunday_seconds:30,holiday_seconds:0},1550);
 assert.equal(result.base,13);assert.equal(result.sunday,6);assert.equal(result.total,19);
});
