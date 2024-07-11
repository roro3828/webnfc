const deviceFilter=[{vendorId:1356,productId:3528},{vendorId:1356,productId:3529}];
function checkReader(reader:USBDevice){
    if(typeof deviceFilter.find((d)=>(d.vendorId==reader.vendorId)&&(d.productId==reader.productId))==="undefined"){
        return false;
    }
    return true;
}

type NFCType="Type-F"|"ISO 14443-3A"|"ISO 14443-4A"|"ISO 14443-4B"|"ISO 15693"|"Type-A"|"Type-B"|"Type-V";

export default class NFCReader{
    private device:USBDevice;
    private configurationValue:number;
    private interfaceNumber:number;
    private endpointIn:USBEndpoint;
    private endpointOut:USBEndpoint;

    private seqNumber:number=0;

    constructor(reader:USBDevice){
        if(!checkReader(reader)){
            throw Error("Not a Reader");
        }
        this.device=reader;

        const config=this.getControl(this.device);
        this.configurationValue=config.configurationValue;
        this.interfaceNumber=config.interfaceNumber;
        this.endpointIn=config.endpointIn;
        this.endpointOut=config.endpointOut;
    }

    /**
     * Get reader
     * @returns 
     */
    public static async getReader(){
        const devices=(await navigator.usb.getDevices()).filter((d)=>{
            for(let j=0;j<deviceFilter.length;j++){
                if((d.vendorId==deviceFilter[j].vendorId)&&(d.productId==deviceFilter[j].productId)){
                    return d;
                }
            }
        });

        if(devices.length==1){
            return devices[0];
        }

        try{
            const usbDevice=await navigator.usb.requestDevice({filters:deviceFilter});
            return usbDevice;
        }
        catch{
            console.log("failed to get usb");
        }
        return null;
    }
    /**
     * Get Control option
     * @param reader 
     * @returns 
     */
    getControl(reader:USBDevice){
        if(!checkReader(reader)){
            throw Error("Device is not NFCReader");
        }
        if(typeof reader.configuration==="undefined"){
            throw Error();
        }

        const configurationValue=reader.configuration.configurationValue;
        const interfaceNumber=reader.configuration.interfaces[configurationValue].interfaceNumber;
        const endpointIn=reader.configuration.interfaces[configurationValue].alternate.endpoints.find((e)=>e.direction=="in");
        const endpointOut=reader.configuration.interfaces[configurationValue].alternate.endpoints.find((e)=>e.direction=="out");
        if(typeof endpointIn==="undefined"||typeof endpointOut==="undefined"){
            throw Error("Endpoint not found");
        }

        return{
            configurationValue,
            interfaceNumber,
            endpointIn,
            endpointOut
        };
    }

    async open(){
        await this.device.open();
        await this.device.selectConfiguration(this.configurationValue);
        await this.device.claimInterface(this.interfaceNumber);
        await this.endTransparent();
        await this.startTransparent();
        await this.RFOff();
        await this.RFOn();
    }
    async close(){
        await this.RFOff();
        await this.endTransparent();
        await this.device.releaseInterface(this.configurationValue);
        await this.device.close();
    }

    async send(data:Uint8Array){
        const datalen=data.byteLength;
        
        const senddata=new Uint8Array(10+datalen);
        senddata[0]=0x6b;
        senddata[1]=0xFF&datalen;
        senddata[2]=(datalen>>8)&0xFF;
        senddata[3]=(datalen>>16)&0xFF;
        senddata[4]=(datalen>>24)&0xFF;
        senddata[5]=0x00;
        senddata[6]=this.seqNumber;
        this.seqNumber=(this.seqNumber+1)%256;


        senddata.set(data,10);
        console.log("SEND->"+toHEX(senddata));
        const result=await this.device.transferOut(this.endpointOut.endpointNumber,senddata);
        return result.status;
    }
    async receive(readLen:number){
        const result=await this.device.transferIn(this.endpointIn.endpointNumber,readLen);
        if(typeof result.data==="undefined"||typeof result.status==="undefined"){
            throw Error("Couldn't read");
        }

        const rawdata=new Uint8Array(result.data.buffer);
        const slotNumber=rawdata[5];
        const seqNumber=rawdata[6];
        const data=rawdata.slice(10,rawdata.length-2);
        console.log("RECE->"+toHEX(rawdata));

        return{
            data,
            status:result.status,
            slotNumber,
            seqNumber
        };
    }

    async startTransparent(){
        await this.send(new Uint8Array([0xFF,0x50,0x00,0x00,0x02,0x81,0x00,0x00]));
        return this.receive(64);
    }
    async endTransparent(){
        await this.send(new Uint8Array([0xFF,0x50,0x00,0x00,0x02,0x82,0x00,0x00]));
        return this.receive(64);
    }
    async RFOn(){
        await this.send(new Uint8Array([0xFF,0x50,0x00,0x00,0x02,0x84,0x00,0x00]));
        return this.receive(64);
    }
    async RFOff(){
        await this.send(new Uint8Array([0xFF,0x50,0x00,0x00,0x02,0x83,0x00,0x00]));
        return this.receive(64);
    }

    async switchProtocol(type:NFCType){
        if(type=="Type-F"){
            await this.send(new Uint8Array([0xFF,0x50,0x00,0x02,0x04,0x8f,0x02,0x03,0x00,0x00]));
        }
        else if(type=="ISO 14443-3A"){
            await this.send(new Uint8Array([0xFF,0x50,0x00,0x02,0x04,0x8f,0x02,0x00,0x03,0x00]));
        }
        else if(type=="ISO 14443-4A"||type=="Type-A"){
            await this.send(new Uint8Array([0xFF,0x50,0x00,0x02,0x04,0x8f,0x02,0x00,0x04,0x00]));
        }
        else if(type=="ISO 14443-4B"||type=="Type-B"){
            await this.send(new Uint8Array([0xFF,0x50,0x00,0x02,0x04,0x8f,0x02,0x01,0x04,0x00]));
        }
        else if(type=="ISO 15693"||type=="Type-V"){
            await this.send(new Uint8Array([0xFF,0x50,0x00,0x02,0x04,0x8f,0x02,0x02,0x03,0x00]));
        }
        
        return this.receive(128);
    }

    async communicateThruEX(data:Uint8Array,readLen:number=128):Promise<{status:true,data:{[tag:string]:Uint8Array}}|{status:false,data:null}>{
        const datalen=data.byteLength;
        
        const senddata=new Uint8Array(10+datalen);
        senddata[0]=0xFF;
        senddata[1]=0x50;
        senddata[2]=0x00;
        senddata[3]=0x01;
        senddata[4]=0x00;
        senddata[5]=0x00;
        senddata[6]=datalen&0xFF;
        senddata.set(data,7);

        const sstatus=await this.send(senddata);
        if(sstatus!="ok"){
            throw Error("Failed to send");
        }
        
        const response=await this.receive(readLen);
        if(response.status!="ok"){
            throw Error("Failed to receive");
        }

        const status=response.data.slice(3,5);

        if(!(status[0]==0x90&&status[1]==0x00)){
            console.log("Failed");
            return{
                status:false,
                data:null
            };
        }

        const responsedata:{[tag:string]:Uint8Array}={};
        let c=5;

        while(c<response.data.byteLength){
            const datatag=("00"+response.data[c].toString(16).toUpperCase()).slice(-2);
            const datalen=response.data[c+1];
            responsedata[datatag]=response.data.slice(c+2,c+2+datalen);
            c+=2+datalen;
        }
        
        return{
            status:true,
            data:responsedata
        }
    }

    async felicaCommunicateThruEX(data:Uint8Array,timeout:number=10000,readLen:number=64):Promise<{status:true,data:{[tag:string]:Uint8Array}}|{status:false,data:null}>{
        const datalen=data.byteLength;
        
        const senddata=new Uint8Array(11+datalen);
        senddata[0]=0x5F;
        senddata[1]=0x46;
        senddata[2]=0x04;
        senddata[3]=0xFF&timeout;
        senddata[4]=(timeout>>8)&0xFF;
        senddata[5]=(timeout>>16)&0xFF;
        senddata[6]=(timeout>>24)&0xFF;
        senddata[7]=0x95;
        senddata[8]=0x82;
        senddata[9]=(datalen>>8)&0xFF;
        senddata[10]=datalen&0xFF;
        senddata.set(data,11);

        const response=await this.communicateThruEX(senddata,readLen);
        
        return response;
    }

    async felicaPolling(systemcode:number=0xFFFF,reqcode:number=0x01,timeout:number=10000){
        const pollingCmd=new Uint8Array(6);
        pollingCmd[0]=0x06;
        pollingCmd[1]=0x00;
        pollingCmd[2]=(systemcode>>8)&0xFF;
        pollingCmd[3]=systemcode&0xFF;
        pollingCmd[4]=reqcode&0x03;
        pollingCmd[5]=0x00;

        const data=await this.felicaCommunicateThruEX(pollingCmd,timeout);
        if(data.data){
            if(data.data.hasOwnProperty("97")){
                const pollingres=data.data["97"];
                const idm=pollingres.slice(2,10);
                const pmm=pollingres.slice(10,18);
                const reqdata=pollingres.slice(18,20);
                return {
                    idm,pmm,reqdata
                }
            }
        }


        return null;
    }

    async sendAPDU(CLA:number,INS:number,P1:number,P2:number,timeout:number=10000){
        const apdu=new Uint8Array(6);
        apdu[0]=0x0A;
        apdu[1]=0x02;

        apdu[2]=CLA&0xFF;
        apdu[3]=INS&0xFF;
        apdu[4]=P1&0xFF;
        apdu[5]=P2&0xFF;

        const data=await this.felicaCommunicateThruEX(apdu,timeout);
        if(data.data){
            if(data.data.hasOwnProperty("97")){
                return data.data["97"];
            }
        }

        return null;
    }
}

export function toHEX(data:Uint8Array){
    let str="";
    for(let i=0;i<data.byteLength;i++){
        str+="0x"+("00"+data[i].toString(16).toUpperCase()).slice(-2)+" ";
    }
    return str;
}
export async function sleep(ms:number){
    return new Promise(r=>setTimeout(r,ms));
}