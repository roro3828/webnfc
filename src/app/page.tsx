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

        await reader.switchProtocol("Type-B");

        const data=await reader.send(new Uint8Array([0xFF,0xCA,0x00,0x00]));
        await reader.receive(64);

        console.log(await reader.sendAPDU(0x00,0xA4,0x00,0x00));
        //const data=await reader.felicaPolling(0x0003);

        //await reader.switchProtocolTypeA();
        //await reader.send(new Uint8Array( [0xff, 0xCA, 0x00, 0x00]));
        //console.log(await reader.receive(128));

        await reader.close();
    }

    return(
        <button onClick={nfc}>{"GET"}</button>
    )

}
