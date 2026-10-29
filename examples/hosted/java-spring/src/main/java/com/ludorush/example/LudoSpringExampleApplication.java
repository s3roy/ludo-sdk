package com.ludorush.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(LudoSidecarProperties.class)
public class LudoSpringExampleApplication {
  public static void main(String[] args) {
    SpringApplication.run(LudoSpringExampleApplication.class, args);
  }
}
