#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (DemoMemoryModule, NSObject)

RCT_EXTERN_METHOD(getInfo : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(runTool : (nonnull NSString *)name args : (nonnull NSDictionary *)args resolve : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getCard : (nonnull NSString *)type id : (nonnull NSString *)id resolve : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)

@end
