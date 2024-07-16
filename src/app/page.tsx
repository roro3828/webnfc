"use client"

import NFCReader, { toHEX } from "@/lib/nfc/rcs300";
import { useEffect, useState } from "react";

export default function NFC(){
    async function nfc(){
        const device=await NFCReader.getReader();
        if(device==null){
            return;
        }
        const reader=new NFCReader(device);
        await reader.open();
        await reader.initISO14443();

        await reader.switchProtocol("Type-B");

        await reader.sendAPDU(0x00,0xA4,0x00,0x00);
        await reader.sendAPDU(0x00,0xA4,0x02,0x0C,new Uint8Array([0x2f,0x01]));
        const data=await reader.sendAPDU(0x00,0xB0,0x00,0x05,undefined,8);

        if(data==null){
            return;
        }

        const syear=(data[0]>>4)*1000+(data[0]&0x0F)*100+(data[1]>>4)*10+(data[1]&0x0F);
        const smonth=(data[2]>>4)*10+(data[2]&0x0F);
        const sday=(data[3]>>4)*10+(data[3]&0x0F);
        const eyear=(data[4]>>4)*1000+(data[4]&0x0F)*100+(data[5]>>4)*10+(data[5]&0x0F);
        const emonth=(data[6]>>4)*10+(data[6]&0x0F);
        const eday=(data[7]>>4)*10+(data[7]&0x0F);
        console.log(`交付日  :${syear}年${smonth}月${sday}日`);
        console.log(`有効期限:${eyear}年${emonth}月${eday}日`);

        await reader.close();
    }

    return(
        <button onClick={nfc}>{"GET"}</button>
    )

}
