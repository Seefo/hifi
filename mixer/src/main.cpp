#include <iostream>
#include <math.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <sys/time.h>
#include <pthread.h>
#include <errno.h>
#include <fstream>
#include <limits>
#include "AudioRingBuffer.h"
#include <AgentList.h>
#include <SharedUtil.h>

const unsigned short MIXER_LISTEN_PORT = 55443;

const float SAMPLE_RATE = 22050.0;
const float BUFFER_SEND_INTERVAL_USECS = (BUFFER_LENGTH_SAMPLES/SAMPLE_RATE) * 1000000;

const short JITTER_BUFFER_MSECS = 20;
const short JITTER_BUFFER_SAMPLES = JITTER_BUFFER_MSECS * (SAMPLE_RATE / 1000.0);

const long MAX_SAMPLE_VALUE = std::numeric_limits<int16_t>::max();
const long MIN_SAMPLE_VALUE = std::numeric_limits<int16_t>::min();

const float DISTANCE_RATIO = 3.0/4.2;

char DOMAIN_HOSTNAME[] = "highfidelity.below92.com";
char DOMAIN_IP[100] = "";    //  IP Address will be re-set by lookup on startup
const int DOMAINSERVER_PORT = 40102; 

AgentList agentList(MIXER_LISTEN_PORT);

void *sendBuffer(void *args)
{
    int sentBytes;
    int nextFrame = 0;
    timeval startTime;
    
    gettimeofday(&startTime, NULL);

    while (true) {
        sentBytes = 0;
        
        for (int i = 0; i < agentList.getAgents().size(); i++) {
            AudioRingBuffer *agentBuffer = (AudioRingBuffer *) agentList.getAgents()[i].getLinkedData();
            
            if (agentBuffer != NULL && agentBuffer->getEndOfLastWrite() != NULL) {
                
                if (!agentBuffer->isStarted() && agentBuffer->diffLastWriteNextOutput() <= BUFFER_LENGTH_SAMPLES + JITTER_BUFFER_SAMPLES) {
                    printf("Held back buffer %d.\n", i);
                } else if (agentBuffer->diffLastWriteNextOutput() < BUFFER_LENGTH_SAMPLES) {
                    printf("Buffer %d starved.\n", i);
                    agentBuffer->setStarted(false);
                } else {
                    // good buffer, add this to the mix
                    agentBuffer->setStarted(true);
                    agentBuffer->setAddedToMix(true);
                }
                
            }
        }

        for (int i = 0; i < agentList.getAgents().size(); i++) {
            Agent *agent = &agentList.getAgents()[i];
            
            int16_t clientMix[BUFFER_LENGTH_SAMPLES] = {};
            
            for (int j = 0; j < agentList.getAgents().size(); j++) {
                if (i != j) {
                    AudioRingBuffer *otherAgentBuffer = (AudioRingBuffer *)agentList.getAgents()[j].getLinkedData();
                    
                    float *agentPosition = ((AudioRingBuffer *)agent->getLinkedData())->getPosition();
                    float *otherAgentPosition = otherAgentBuffer->getPosition();
                    
                    float distanceToAgent = sqrtf(powf(agentPosition[0] - otherAgentPosition[0], 2) +
                                                  powf(agentPosition[1] - otherAgentPosition[1], 2) +
                                                  powf(agentPosition[2] - otherAgentPosition[2], 2));
                    
                    float distanceCoeff = powf((logf(DISTANCE_RATIO * distanceToAgent) / logf(3)), 2);
                    
                    for (int s = 0; s < BUFFER_LENGTH_SAMPLES; s++) {
                        int16_t sample = (otherAgentBuffer->getNextOutput()[s] / distanceCoeff);
                        clientMix[s] += sample;
                    }
                }
            }
            
            agentList.getAgentSocket().send(agent->getPublicSocket(), clientMix, BUFFER_LENGTH_BYTES);
        }
        
        for (int i = 0; i < agentList.getAgents().size(); i++) {
            AudioRingBuffer *agentBuffer = (AudioRingBuffer *)agentList.getAgents()[i].getLinkedData();
            if (agentBuffer->wasAddedToMix()) {
                agentBuffer->setNextOutput(agentBuffer->getNextOutput() + BUFFER_LENGTH_SAMPLES);
                
                if (agentBuffer->getNextOutput() >= agentBuffer->getBuffer() + RING_BUFFER_SAMPLES) {
                    agentBuffer->setNextOutput(agentBuffer->getBuffer());
                }
                
                agentBuffer->setAddedToMix(false);
            }
        }
        
        double usecToSleep = usecTimestamp(&startTime) + (++nextFrame * BUFFER_SEND_INTERVAL_USECS) - usecTimestampNow();
        
        if (usecToSleep > 0) {
            usleep(usecToSleep);
        } else {
            std::cout << "Took too much time, not sleeping!\n";
        }
    }  

    pthread_exit(0);  
}

void *reportAliveToDS(void *args) {
    
    timeval lastSend;
    unsigned char output[7];
   
    while (true) {
        gettimeofday(&lastSend, NULL);
        
        *output = 'M';
        packSocket(output + 1, 895283510, htons(MIXER_LISTEN_PORT));
//        packSocket(output + 1, 788637888, htons(MIXER_LISTEN_PORT));
        agentList.getAgentSocket().send(DOMAIN_IP, DOMAINSERVER_PORT, output, 7);
        
        double usecToSleep = 1000000 - (usecTimestampNow() - usecTimestamp(&lastSend));
        
        if (usecToSleep > 0) {
            usleep(usecToSleep);
        } else {
            std::cout << "No sleep required!";
        }
    }    
}

void attachNewBufferToAgent(Agent *newAgent) {
    if (newAgent->getLinkedData() == NULL) {
        newAgent->setLinkedData(new AudioRingBuffer());
    }
}

int main(int argc, const char * argv[])
{
    ssize_t receivedBytes = 0;
    
    agentList.linkedDataCreateCallback = attachNewBufferToAgent;
    
    agentList.startSilentAgentRemovalThread();
    
    // setup the agentSocket to report to domain server
    pthread_t reportAliveThread;
    pthread_create(&reportAliveThread, NULL, reportAliveToDS, NULL);
    
    //  Lookup the IP address of things we have hostnames
    if (atoi(DOMAIN_IP) == 0) {
        struct hostent* pHostInfo;
        if ((pHostInfo = gethostbyname(DOMAIN_HOSTNAME)) != NULL) {
            sockaddr_in tempAddress;
            memcpy(&tempAddress.sin_addr, pHostInfo->h_addr_list[0], pHostInfo->h_length);
            strcpy(DOMAIN_IP, inet_ntoa(tempAddress.sin_addr));
            printf("Domain server %s: %s\n", DOMAIN_HOSTNAME, DOMAIN_IP);
            
        } else {
            printf("Failed lookup domainserver\n");
        }
    } else {
        printf("Using static domainserver IP: %s\n", DOMAIN_IP);
    }

    unsigned char *packetData = new unsigned char[MAX_PACKET_SIZE];

    pthread_t sendBufferThread;
    pthread_create(&sendBufferThread, NULL, sendBuffer, NULL);
    
    sockaddr *agentAddress = new sockaddr;

    while (true) {
        if(agentList.getAgentSocket().receive(agentAddress, packetData, &receivedBytes)) {
            if (receivedBytes >= BUFFER_LENGTH_BYTES) {
                // add or update the existing interface agent
                agentList.addOrUpdateAgent(agentAddress, agentAddress, packetData[0]);
                agentList.updateAgentWithData(agentAddress, (void *)packetData, receivedBytes);
            }
        }
    }
    
    agentList.stopSilentAgentRemovalThread();
    pthread_join(reportAliveThread, NULL);
    pthread_join(sendBufferThread, NULL);
    
    return 0;
}

